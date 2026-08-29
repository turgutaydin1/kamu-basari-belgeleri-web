/*
 * ParityService.gs
 * Masaustu uygulamayla kalan kritik davranis esitlikleri.
 */

function getApprovalGroupPdfModelWeb(token, approvalListId) {
  const detail = getApprovalListDetail(token, approvalListId);
  if (!detail || !detail.ok) return detail || fail_('Olur listesi bulunamadı.');
  const active = (detail.items || []).filter(x => x.record && !clean_(x.item.removed_at));
  if (!active.length) return fail_('Bu Olur listesinde indirilebilecek aktif kayıt bulunmuyor.');
  return {
    ok:true,
    approval_list:detail.approval_list,
    rows:active.map((x,i)=>({
      sira_no:i+1,
      ad_soyad:clean_(x.item.ad_soyad),
      tc_kimlik:clean_(x.item.tc_kimlik),
      gorev_yeri:clean_(x.item.gorev_yeri),
      unvan:clean_(x.item.unvan)
    }))
  };
}

function strictMarkDeliveredWeb(token, recordIds) {
  const u=requireUser_(token);
  let count=0, noPdf=0, notApproval=0, missing=0;
  uniq_(recordIds||[]).forEach(id=>{
    const r=ownById_('records',u.id,id);
    if(!r){missing++;return;}
    if(r.status!=='OLUR_LISTESINDE'){notApproval++;return;}
    if(!clean_(r.tarih)||!clean_(r.sayi)||!clean_(r.pdf_file_id)){noPdf++;return;}
    updateById_('records',r.id,{status:'TESLIM_EDILDI',delivered_at:nowIso_(),updated_at:nowIso_()});
    audit_(u.id,'DELIVERED',r.id,'PDF kontrolü ile teslim edildi');
    count++;
  });
  return count ? {ok:true,count,no_pdf:noPdf,not_approval:notApproval,missing} : fail_('PDF hazırlanmış uygun kayıt bulunamadı.');
}

function getApprovalLetterSettingsWeb(token) {
  const u=requireUser_(token);
  ensureFullDefaults_(u.id);
  const cfg=getConfigObject_(u.id);
  const result={};
  ['BASARI','USTUN_BASARI'].forEach(type=>{
    const label=type==='USTUN_BASARI'?'Üstün Başarı Belgesi':'Başarı Belgesi';
    result[type]={
      use_approval_letter_info:cfg[`document.${type}.use_approval_letter_info`]==='true',
      approval_letter_heading:clean_(cfg[`document.${type}.approval_letter_heading`]||`${label} Olur Yazısının:`),
      approval_letter_number_prefix:clean_(cfg[`document.${type}.approval_letter_number_prefix`]||'')
    };
  });
  return {ok:true,settings:result};
}

function saveApprovalLetterSettingsWeb(token, belgeTuru, patch) {
  const u=requireUser_(token);
  const type=belgeTuru==='USTUN_BASARI'?'USTUN_BASARI':'BASARI';
  patch=patch||{};
  setConfig_(u.id,`document.${type}.use_approval_letter_info`,patch.use_approval_letter_info?'true':'false');
  setConfig_(u.id,`document.${type}.approval_letter_heading`,clean_(patch.approval_letter_heading));
  setConfig_(u.id,`document.${type}.approval_letter_number_prefix`,clean_(patch.approval_letter_number_prefix));
  audit_(u.id,'SAVE_APPROVAL_LETTER_SETTINGS','',JSON.stringify({type,patch}));
  return ok_('Olur Yazısı ayarları kaydedildi.');
}

function getPdfApprovalRequirementWeb(token, recordId) {
  const u=requireUser_(token);
  const r=ownById_('records',u.id,recordId);
  if(!r)return fail_('Kayıt bulunamadı.');
  ensureFullDefaults_(u.id);
  const cfg=getConfigObject_(u.id),type=r.belge_turu==='USTUN_BASARI'?'USTUN_BASARI':'BASARI';
  return {ok:true,
    enabled:cfg[`document.${type}.use_approval_letter_info`]==='true',
    heading:clean_(cfg[`document.${type}.approval_letter_heading`]||((type==='USTUN_BASARI'?'Üstün Başarı Belgesi':'Başarı Belgesi')+' Olur Yazısının:')),
    prefix:clean_(cfg[`document.${type}.approval_letter_number_prefix`]||''),
    approval_list_id:clean_(r.approval_list_id)
  };
}

function saveRecordApprovalInfoWeb(token, recordId, dateText, lastNumber) {
  const u=requireUser_(token);
  const r=ownById_('records',u.id,recordId);
  if(!r)return fail_('Kayıt bulunamadı.');
  const cfg=getConfigObject_(u.id),type=r.belge_turu==='USTUN_BASARI'?'USTUN_BASARI':'BASARI';
  const enabled=cfg[`document.${type}.use_approval_letter_info`]==='true';
  if(!enabled)return {ok:true,date:'',number:''};
  dateText=clean_(dateText);lastNumber=clean_(lastNumber);
  if(!/^\d{2}\.\d{2}\.\d{4}$/.test(dateText))return fail_('Olur Yazısı Tarihi GG.AA.YYYY biçiminde girilmelidir.');
  if(!lastNumber)return fail_('Olur Yazısı Son Numarası boş bırakılamaz.');
  const prefix=clean_(cfg[`document.${type}.approval_letter_number_prefix`]||'');
  const number=prefix+lastNumber;
  const listId=clean_(r.approval_list_id)||r.id;
  setConfig_(u.id,'approval.'+listId+'.date',dateText);
  setConfig_(u.id,'approval.'+listId+'.number',number);
  audit_(u.id,'SAVE_APPROVAL_LETTER_INFO',r.id,JSON.stringify({date:dateText,number:number}));
  return {ok:true,date:dateText,number:number};
}

function syncLegacyDocumentSettingsWeb(token) {
  const u=requireUser_(token);
  ensureFullDefaults_(u.id);
  const cfg=getConfigObject_(u.id);
  const b=clean_(cfg['document.BASARI.default_taltif_text']||defaultRewardTextWeb_());
  const s=clean_(cfg['document.USTUN_BASARI.default_taltif_text']||defaultRewardTextWeb_());
  setConfig_(u.id,'basari_taltif_metni',b);
  setConfig_(u.id,'ustun_basari_taltif_metni',s);
  return {ok:true};
}
