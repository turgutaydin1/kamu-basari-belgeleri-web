/*
 * BackupService.gs
 * Masaustu Yedekleme ve Disa Aktarim ekraninin web karsiligi.
 */

function createFullBackupWeb(token) {
  const u = requireUser_(token);
  const payload = {
    format:'MIA_BASARI_WEB_BACKUP_V1',
    exported_at:nowIso_(),
    user:{id:u.id,email:u.email,full_name:u.full_name,plan:u.plan},
    tables:{
      records:ownRows_('records',u.id).map(jsonSafe_),
      approval_lists:ownRows_('approval_lists',u.id).map(jsonSafe_),
      approval_list_items:ownRows_('approval_list_items',u.id).map(jsonSafe_),
      counters:rows_('counters').filter(r=>String(r.user_id)===String(u.id)).map(jsonSafe_),
      superior_basis:ownRows_('superior_basis',u.id).map(jsonSafe_),
      achievement_history:ownRows_('achievement_history',u.id).map(jsonSafe_),
      audit_log:ownRows_('audit_log',u.id).map(jsonSafe_),
      config:rows_('config').filter(r=>String(r.user_id)===String(u.id)).map(jsonSafe_)
    }
  };
  const jsonBlob = Utilities.newBlob(JSON.stringify(payload,null,2),'application/json','veriler.json');
  const manifest = Utilities.newBlob(
    'Kamu Kurumlari Basari Belgeleri Duzenleme ve Takip Sistemi\n'+
    'Yedek tarihi: '+formatDateTR_(new Date())+'\n'+
    'Kullanici: '+clean_(u.full_name)+'\n'+
    'Kayit: '+payload.tables.records.length+'\n',
    'text/plain','BILGI.txt'
  );
  const zip = Utilities.zip([jsonBlob,manifest], 'basari_belgeleri_yedek_'+Utilities.formatDate(new Date(),'Europe/Istanbul','yyyyMMdd_HHmmss')+'.zip');
  const folders=ensureUserFolders_(u.id,u.email);
  const file=folders.backups.createFile(zip);
  audit_(u.id,'CREATE_FULL_BACKUP','',file.getId());
  return {ok:true,name:file.getName(),base64:Utilities.base64Encode(file.getBlob().getBytes())};
}

function exportRecordsCsvWeb(token, filters) {
  const u=requireUser_(token);
  filters=filters||{};
  let rows=ownRows_('records',u.id);
  const status=clean_(filters.status), type=clean_(filters.belge_turu), year=Number(filters.yil||0);
  if(status && status!=='TUMU') rows=rows.filter(r=>r.status===status);
  if(type && type!=='TUMU') rows=rows.filter(r=>r.belge_turu===type);
  if(year) rows=rows.filter(r=>Number(r.yil||yearOf_(r.created_at))===year);
  const header=['BELGE TURU','TC KIMLIK NO','AD SOYAD','UNVAN','GOREV YERI','TARIH','YIL','SAYI','GEREKCE','TALTIF METNI','DURUM'];
  const lines=[header.map(csvCellWeb_).join(';')];
  rows.forEach(r=>lines.push([
    r.belge_turu,r.tc_kimlik,r.ad_soyad,r.unvan,r.gorev_yeri,r.tarih,r.yil,r.sayi,r.gerekce,r.taltif_metni,r.status
  ].map(csvCellWeb_).join(';')));
  const text='\ufeff'+lines.join('\r\n');
  audit_(u.id,'EXPORT_CSV','',JSON.stringify({count:rows.length}));
  return {ok:true,name:'basari_belgeleri_'+Utilities.formatDate(new Date(),'Europe/Istanbul','yyyyMMdd_HHmmss')+'.csv',base64:Utilities.base64Encode(Utilities.newBlob(text,'text/csv').getBytes())};
}

function csvCellWeb_(v) {
  const s=String(v==null?'':v).replace(/"/g,'""');
  return '"'+s+'"';
}
