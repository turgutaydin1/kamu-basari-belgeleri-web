/* PDF hazırlığında sayaç tüketmeden önce zorunlu kontroller. */
function validatePdfPrerequisitesWeb(token, recordId) {
  const u=requireUser_(token);
  ensureFullDefaults_(u.id);
  const r=ownById_('records',u.id,recordId);
  if(!r)return fail_('Kayıt bulunamadı.');
  if(r.status!=='OLUR_LISTESINDE')return fail_('PDF yalnız Olur Listesindeki kayıt için hazırlanabilir.');
  if(!clean_(r.foto_path))return fail_('PDF hazırlamadan önce fotoğraf zorunludur.');
  const full=fullSettingsObject_(u.id),type=r.belge_turu==='USTUN_BASARI'?'USTUN_BASARI':'BASARI';
  const templateId=clean_(full.document_by_type[type].default_template_id||(type==='USTUN_BASARI'?'dikey_2':'dikey_1'));
  const cfg=getConfigObject_(u.id),fid=clean_(cfg['template.asset.'+templateId]||'');
  if(!fid)return fail_(templateId+' şablon görseli yüklenmemiş. Sistem Ayarları > Şablonlar bölümünden gerçek şablonu yükleyin.');
  try{const f=DriveApp.getFileById(fid);if(f.isTrashed())return fail_(templateId+' şablon görseli bulunamadı.');}catch(e){return fail_(templateId+' şablon görseli okunamadı.');}
  return {ok:true,template_id:templateId};
}
