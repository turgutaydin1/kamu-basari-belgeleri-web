/*
 * RecordService.gs
 * Masaüstü app.py kayıt davranışlarının web karşılıkları.
 * Code.gs çekirdeğindeki tablo ve oturum yardımcılarını kullanır.
 */

function getRecordDetail(token, recordId) {
  const u = requireUser_(token);
  const r = ownById_('records', u.id, recordId);
  if (!r) return fail_('Kayıt bulunamadı.');

  const basis = ownRows_('superior_basis', u.id)
    .filter(x => String(x.superior_record_id) === String(r.id))
    .map(jsonSafe_);

  let approvalList = null;
  if (clean_(r.approval_list_id)) {
    approvalList = ownById_('approval_lists', u.id, r.approval_list_id);
  }

  return {
    ok: true,
    record: jsonSafe_(r),
    superior_basis: basis,
    approval_list: approvalList ? jsonSafe_(approvalList) : null,
    can_edit: r.status === 'TASLAK',
    can_return_to_draft: r.status === 'OLUR_LISTESINDE' && withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS),
    used_as_superior_basis: isUsedAsSuperiorBasis_(u.id, r.id)
  };
}

function updateDraftRecord(token, recordId, data) {
  const u = requireUser_(token);
  const r = ownById_('records', u.id, recordId);
  if (!r) return fail_('Kayıt bulunamadı.');
  if (r.status !== 'TASLAK') return fail_('Yalnız Taslak kayıtlar düzenlenebilir.');
  if (isUsedAsSuperiorBasis_(u.id, r.id)) return fail_('Bu Başarı Belgesi aktif bir Üstün Başarı Belgesine dayanak olduğu için değiştirilemez.');

  data = data || {};
  const tc = cleanTc_(data.tc_kimlik || r.tc_kimlik);
  if (!/^\d{11}$/.test(tc)) return fail_('T.C. Kimlik No 11 haneli olmalıdır.');
  const adSoyad = clean_(data.ad_soyad || r.ad_soyad);
  if (!adSoyad) return fail_('Ad Soyad zorunludur.');

  const belge = data.belge_turu === 'USTUN_BASARI' ? 'USTUN_BASARI' : (data.belge_turu === 'BASARI' ? 'BASARI' : r.belge_turu);
  if (belge !== r.belge_turu) {
    return fail_('Taslak düzenlemede belge türü değiştirilemez. Yeni kayıt oluşturun.');
  }

  const patch = {
    tc_kimlik: tc,
    ad_soyad: adSoyad,
    unvan: clean_(data.unvan !== undefined ? data.unvan : r.unvan),
    gorev_yeri: clean_(data.gorev_yeri !== undefined ? data.gorev_yeri : r.gorev_yeri),
    gerekce: clean_(data.gerekce !== undefined ? data.gerekce : r.gerekce),
    taltif_metni: clean_(data.taltif_metni !== undefined ? data.taltif_metni : r.taltif_metni),
    foto_path: clean_(data.foto_path || r.foto_path),
    signature_mode: clean_(data.signature_mode || r.signature_mode || 'WET'),
    signer_name: clean_(data.signer_name !== undefined ? data.signer_name : r.signer_name),
    signer_title: clean_(data.signer_title !== undefined ? data.signer_title : r.signer_title),
    signature_path: clean_(data.signature_path || r.signature_path),
    record_fingerprint: fingerprint_(r.belge_turu, tc, adSoyad, clean_(data.gorev_yeri !== undefined ? data.gorev_yeri : r.gorev_yeri)),
    updated_at: nowIso_()
  };

  updateById_('records', r.id, patch);
  audit_(u.id, 'UPDATE_DRAFT', r.id, JSON.stringify({tc_kimlik:tc,ad_soyad:adSoyad}));
  return ok_('Taslak güncellendi.');
}

function deleteDraftRecord(token, recordId) {
  const u = requireUser_(token);
  const r = ownById_('records', u.id, recordId);
  if (!r) return fail_('Kayıt bulunamadı.');
  if (r.status !== 'TASLAK') return fail_('Yalnız Taslak kayıtlar silinebilir.');
  if (isUsedAsSuperiorBasis_(u.id, r.id)) return fail_('Bu Başarı Belgesi aktif bir Üstün Başarı Belgesine dayanak olduğu için silinemez.');

  deleteWhere_('superior_basis', x => String(x.user_id) === String(u.id) && String(x.superior_record_id) === String(r.id));
  deleteWhere_('records', x => String(x.user_id) === String(u.id) && String(x.id) === String(r.id));
  audit_(u.id, 'DELETE_DRAFT', r.id, '');
  return ok_('Taslak kayıt silindi.');
}

function listApprovalLists(token) {
  const u = requireUser_(token);
  const lists = ownRows_('approval_lists', u.id)
    .sort((a,b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  const items = ownRows_('approval_list_items', u.id);
  const records = ownRows_('records', u.id);

  return {
    ok: true,
    lists: lists.map(list => {
      const li = items.filter(x => String(x.approval_list_id) === String(list.id) && !clean_(x.removed_at));
      const active = li.map(x => records.find(r => String(r.id) === String(x.record_id))).filter(Boolean);
      return jsonSafe_(Object.assign({}, list, {
        item_count: li.length,
        draft_count: active.filter(r => r.status === 'TASLAK').length,
        approval_count: active.filter(r => r.status === 'OLUR_LISTESINDE').length,
        delivered_count: active.filter(r => r.status === 'TESLIM_EDILDI').length,
        cancelled_count: active.filter(r => r.status === 'IPTAL').length
      }));
    })
  };
}

function getApprovalListDetail(token, approvalListId) {
  const u = requireUser_(token);
  const list = ownById_('approval_lists', u.id, approvalListId);
  if (!list) return fail_('Olur listesi bulunamadı.');
  const items = ownRows_('approval_list_items', u.id)
    .filter(x => String(x.approval_list_id) === String(list.id))
    .sort((a,b) => Number(a.sira_no || 0) - Number(b.sira_no || 0));
  const recMap = {};
  ownRows_('records', u.id).forEach(r => recMap[String(r.id)] = r);
  return {
    ok: true,
    approval_list: jsonSafe_(list),
    items: items.map(x => {
      const r = recMap[String(x.record_id)] || null;
      return {item:jsonSafe_(x), record:r ? jsonSafe_(r) : null};
    })
  };
}

function listArchiveRecords(token, filters) {
  const u = requireUser_(token);
  filters = filters || {};
  let rows = ownRows_('records', u.id).filter(r => r.status === 'TESLIM_EDILDI' || r.status === 'IPTAL');

  const q = clean_(filters.query).toLocaleLowerCase('tr-TR');
  const belge = clean_(filters.belge_turu);
  const status = clean_(filters.status);
  const year = Number(filters.yil || 0);

  if (q) rows = rows.filter(r => [r.ad_soyad,r.tc_kimlik,r.unvan,r.gorev_yeri,recordNo_(r)].join(' ').toLocaleLowerCase('tr-TR').indexOf(q) >= 0);
  if (belge && belge !== 'TUMU') rows = rows.filter(r => r.belge_turu === belge);
  if (status && status !== 'TUMU') rows = rows.filter(r => r.status === status);
  if (year) rows = rows.filter(r => Number(r.yil || yearOf_(r.created_at)) === year);

  rows.sort((a,b) => {
    const ay = Number(a.yil || 0), by = Number(b.yil || 0);
    if (ay !== by) return by - ay;
    return Number(b.sayi || 0) - Number(a.sayi || 0);
  });
  return {ok:true, records:rows.map(jsonSafe_)};
}

function getPersonDocumentHistory(token, tc) {
  const u = requireUser_(token);
  tc = cleanTc_(tc);
  const system = ownRows_('records', u.id)
    .filter(r => r.tc_kimlik === tc && r.status !== 'IPTAL')
    .sort((a,b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
  const external = ownRows_('achievement_history', u.id)
    .filter(r => r.tc_kimlik === tc)
    .sort((a,b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0));
  return {ok:true, system:system.map(jsonSafe_), history:external.map(jsonSafe_)};
}

function listAvailableYears(token) {
  const u = requireUser_(token);
  const years = {};
  ownRows_('records', u.id).forEach(r => {
    const y = Number(r.yil || yearOf_(r.created_at) || 0);
    if (y) years[y] = true;
  });
  return {ok:true, years:Object.keys(years).map(Number).sort((a,b)=>b-a)};
}
