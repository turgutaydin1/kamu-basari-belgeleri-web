/*
 * BulkService.gs
 * Masaüstü Toplu İşlemler ekranındaki uygunluk kuralları ve işlemler.
 */

function listBulkCandidates(token, operation, filters) {
  const u = requireUser_(token);
  filters = filters || {};
  const op = clean_(operation);
  let rows = ownRows_('records', u.id);
  const q = clean_(filters.query).toLocaleLowerCase('tr-TR');
  const belge = clean_(filters.belge_turu);
  const year = Number(filters.yil || 0);

  if (q) rows = rows.filter(r => [r.ad_soyad,r.tc_kimlik,r.unvan,r.gorev_yeri,recordNo_(r)].join(' ').toLocaleLowerCase('tr-TR').indexOf(q) >= 0);
  if (belge && belge !== 'TUMU') rows = rows.filter(r => r.belge_turu === belge);
  if (year) rows = rows.filter(r => Number(r.yil || yearOf_(r.created_at)) === year);

  const now = Date.now();
  rows = rows.filter(r => {
    if (op === 'bulk_finalize') return r.status === 'TASLAK';
    if (op === 'bulk_delivered') return r.status === 'OLUR_LISTESINDE' && !!clean_(r.sayi);
    if (op === 'bulk_return') return r.status === 'OLUR_LISTESINDE' && withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS) && !isUsedAsSuperiorBasis_(u.id, r.id);
    if (op === 'bulk_pdf') return r.status === 'TESLIM_EDILDI' || (r.status === 'OLUR_LISTESINDE' && !!clean_(r.sayi));
    if (op === 'bulk_backup') return r.status !== 'IPTAL';
    if (op === 'bulk_photo') return r.status === 'TASLAK' || (r.status === 'OLUR_LISTESINDE' && withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS));
    if (op === 'bulk_delete') return r.status === 'TASLAK' || (r.status === 'OLUR_LISTESINDE' && withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS));
    if (op === 'bulk_cancel') {
      if (r.status === 'TESLIM_EDILDI') return true;
      if (r.status === 'OLUR_LISTESINDE' && r.finalized_at) return now > Date.parse(r.finalized_at) + APPROVAL_EDIT_DAYS*86400000;
      return false;
    }
    return true;
  });

  rows.sort((a,b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
  return {ok:true, records:rows.map(jsonSafe_)};
}

function bulkMoveToApproval(token, recordIds, note) {
  return moveToApproval(token, recordIds, note || 'Toplu Olur Listesine Ekle');
}

function bulkMarkDelivered(token, recordIds) {
  return markDelivered(token, recordIds);
}

function bulkReturnToDraft(token, recordIds, reason) {
  const u = requireUser_(token);
  reason = clean_(reason);
  if (!reason) return fail_('Taslağa dönüş nedeni zorunludur.');

  let returned = 0, usedAsBasis = 0, notEligible = 0, missing = 0;
  uniq_(recordIds || []).forEach(id => {
    const r = ownById_('records', u.id, id);
    if (!r) { missing++; return; }
    if (r.status !== 'OLUR_LISTESINDE' || !withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS)) { notEligible++; return; }
    if (isUsedAsSuperiorBasis_(u.id, r.id)) { usedAsBasis++; return; }

    updateById_('records', r.id, {
      status:'TASLAK', reopened_at:nowIso_(), reopen_reason:reason,
      approval_list_id:'', updated_at:nowIso_()
    });
    markApprovalItemRemoved_(u.id, r.id, reason);
    audit_(u.id,'BULK_RETURN_TO_DRAFT',r.id,reason);
    returned++;
  });
  return {ok:true, returned, used_as_basis:usedAsBasis, not_eligible:notEligible, missing};
}

function bulkDeleteRecords(token, recordIds, reason) {
  const u = requireUser_(token);
  reason = clean_(reason);
  if (!reason) return fail_('Silme nedeni zorunludur.');

  let deleted = 0, usedAsBasis = 0, notEligible = 0, missing = 0;
  uniq_(recordIds || []).forEach(id => {
    const r = ownById_('records', u.id, id);
    if (!r) { missing++; return; }
    const eligible = r.status === 'TASLAK' || (r.status === 'OLUR_LISTESINDE' && withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS));
    if (!eligible) { notEligible++; return; }
    if (isUsedAsSuperiorBasis_(u.id, r.id)) { usedAsBasis++; return; }

    markApprovalItemRemoved_(u.id, r.id, reason);
    deleteWhere_('superior_basis', x => String(x.user_id)===String(u.id) && String(x.superior_record_id)===String(r.id));
    deleteWhere_('records', x => String(x.user_id)===String(u.id) && String(x.id)===String(r.id));
    audit_(u.id,'BULK_DELETE',r.id,reason);
    deleted++;
  });
  return {ok:true, deleted, used_as_basis:usedAsBasis, not_eligible:notEligible, missing};
}

function bulkCancelRecords(token, recordIds, reason) {
  const u = requireUser_(token);
  reason = clean_(reason);
  if (!reason) return fail_('İptal nedeni zorunludur.');

  let cancelled = 0, usedAsBasis = 0, notEligible = 0, alreadyCancelled = 0, missing = 0;
  const now = Date.now();
  uniq_(recordIds || []).forEach(id => {
    const r = ownById_('records', u.id, id);
    if (!r) { missing++; return; }
    if (r.status === 'IPTAL') { alreadyCancelled++; return; }
    const eligible = r.status === 'TESLIM_EDILDI' || (r.status === 'OLUR_LISTESINDE' && r.finalized_at && now > Date.parse(r.finalized_at) + APPROVAL_EDIT_DAYS*86400000);
    if (!eligible) { notEligible++; return; }
    if (isUsedAsSuperiorBasis_(u.id, r.id)) { usedAsBasis++; return; }

    updateById_('records', r.id, {
      status:'IPTAL', cancelled_at:nowIso_(), cancel_reason:reason, updated_at:nowIso_()
    });
    audit_(u.id,'BULK_CANCEL',r.id,reason);
    cancelled++;
  });
  return {ok:true, cancelled, used_as_basis:usedAsBasis, not_eligible:notEligible, already_cancelled:alreadyCancelled, missing};
}

function bulkMatchExistingPhotos(token, recordIds) {
  const u = requireUser_(token);
  const folders = ensureUserFolders_(u.id, u.email);
  const allFiles = [];
  const it = folders.photos.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    allFiles.push({id:f.getId(), name:f.getName()});
  }

  let matched = 0, already = 0, notFound = 0, notEligible = 0;
  uniq_(recordIds || []).forEach(id => {
    const r = ownById_('records', u.id, id);
    if (!r) { notEligible++; return; }
    const eligible = r.status === 'TASLAK' || (r.status === 'OLUR_LISTESINDE' && withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS));
    if (!eligible) { notEligible++; return; }
    if (clean_(r.foto_path)) { already++; return; }

    const tc = clean_(r.tc_kimlik);
    const file = allFiles.find(f => clean_(f.name).replace(/\.[^.]+$/,'').indexOf(tc) === 0);
    if (!file) { notFound++; return; }

    updateById_('records', r.id, {foto_path:`drive:${file.id}`, updated_at:nowIso_()});
    audit_(u.id,'BULK_MATCH_PHOTO',r.id,file.name);
    matched++;
  });
  return {ok:true, matched, already_has_photo:already, not_found:notFound, not_eligible:notEligible};
}

function bulkSetUploadedPhoto(token, recordIds, fileId) {
  const u = requireUser_(token);
  fileId = clean_(fileId);
  if (!fileId) return fail_('Fotoğraf dosyası bulunamadı.');
  let updated = 0;
  uniq_(recordIds || []).forEach(id => {
    const r = ownById_('records', u.id, id);
    if (!r) return;
    if (r.status === 'TASLAK' || (r.status === 'OLUR_LISTESINDE' && withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS))) {
      updateById_('records', r.id, {foto_path:`drive:${fileId}`,updated_at:nowIso_()});
      audit_(u.id,'BULK_SET_PHOTO',r.id,fileId);
      updated++;
    }
  });
  return {ok:true,updated};
}
