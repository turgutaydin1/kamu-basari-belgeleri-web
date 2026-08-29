/*
 * PdfService.gs
 * BasariProgrami.zip icindeki guncel app.py + system_config.json PDF davranisinin web servis katmani.
 * PDF cizimi tarayicida jsPDF ile yapilir; bu servis resmi tarih/sayi, sablon, koordinat,
 * fotograf/imza ve ikinci sayfa verisini tek bir model olarak hazirlar.
 */

const PDF_TEMPLATE_IDS_WEB = ['dikey_1','dikey_2','yatay_1','yatay_2'];

function getDesktopTemplateLayoutsWeb_() {
  return {
    dikey_1: {
      orientation:'portrait', margin_equal:true,
      margin_top_mm:4.0, margin_bottom_mm:4.0, margin_left_mm:4.0, margin_right_mm:4.0,
      photo_x:249.48, photo_y:452.61, photo_w:93.72, photo_h:112.44,
      identity_center_x:297.64, identity_label_start_y:437.52, identity_row_gap:32.64,
      identity_value_offset:16.32, identity_line_offset:19.92,
      identity_line_left:163.56, identity_line_right:431.04,
      identity_label_size:14.04, identity_value_size:14.04,
      identity_ad_center_x:297.64, identity_ad_label_y:437.52,
      identity_tc_center_x:297.64, identity_tc_label_y:404.88,
      identity_unvan_center_x:297.64, identity_unvan_label_y:372.24,
      identity_gorev_center_x:297.64, identity_gorev_label_y:339.60,
      taltif_x:55.32, taltif_right:543.44, taltif_start_y:264.36,
      taltif_font_size:14.04, taltif_leading:17.4,
      signature_center_x:297.64, signature_name_y:152.04,
      signature_title1_y:134.88, signature_title2_y:99.24,
      signature_name_size:14.04, signature_title_size:14.04,
      signature_image_center_x:297.64, signature_image_y:130.0,
      signature_image_w:120.0, signature_image_h:120.0,
      page2_date_x:28.32, page2_date_y:761.89,
      page2_number_x:28.32, page2_number_y:744.69,
      page2_approval_heading_y:714.69, page2_approval_date_y:696.49,
      page2_approval_number_y:679.29,
      page2_heading_x:28.32, page2_heading_y:693.49,
      page2_table_x:28.32, page2_table_top:671.59, page2_table_right:566.96,
      page2_legislation_x:28.32, page2_legislation_y:507.0, page2_legislation_right:566.96
    },
    dikey_2: {
      orientation:'portrait', margin_equal:true,
      margin_top_mm:5.0, margin_bottom_mm:5.0, margin_left_mm:5.0, margin_right_mm:5.0,
      photo_x:251.0, photo_y:500.0, photo_w:93.72, photo_h:112.44,
      identity_center_x:297.64, identity_label_start_y:490.0, identity_row_gap:19.64,
      identity_value_offset:16.32, identity_line_offset:19.92,
      identity_line_left:163.56, identity_line_right:431.04,
      identity_label_size:14.04, identity_value_size:14.04,
      identity_ad_center_x:297.64, identity_ad_label_y:480.0,
      identity_tc_center_x:297.64, identity_tc_label_y:440.0,
      identity_unvan_center_x:297.64, identity_unvan_label_y:400.0,
      identity_gorev_center_x:297.64, identity_gorev_label_y:360.0,
      taltif_x:65.0, taltif_right:525.44, taltif_start_y:290.0,
      taltif_font_size:14.04, taltif_leading:17.4,
      signature_center_x:297.64, signature_name_y:152.04,
      signature_title1_y:134.88, signature_title2_y:99.24,
      signature_name_size:14.04, signature_title_size:14.04,
      signature_image_center_x:297.64, signature_image_y:145.0,
      signature_image_w:120.0, signature_image_h:120.0,
      page2_date_x:28.32, page2_date_y:761.89,
      page2_number_x:28.32, page2_number_y:744.69,
      page2_approval_heading_y:714.69, page2_approval_date_y:696.49,
      page2_approval_number_y:679.29,
      page2_heading_x:28.32, page2_heading_y:693.49,
      page2_table_x:28.32, page2_table_top:671.59, page2_table_right:566.96,
      page2_legislation_x:28.32, page2_legislation_y:507.0, page2_legislation_right:566.96
    },
    yatay_1: {
      orientation:'landscape', margin_equal:true,
      margin_top_mm:5.0, margin_bottom_mm:5.0, margin_left_mm:5.0, margin_right_mm:5.0,
      photo_x:225.0, photo_y:245.0, photo_w:96.0, photo_h:118.0,
      identity_center_x:490.0, identity_label_start_y:375.0, identity_row_gap:39.0,
      identity_value_offset:17.0, identity_line_offset:21.0,
      identity_line_left:350.0, identity_line_right:645.0,
      identity_label_size:13.2, identity_value_size:13.2,
      identity_ad_center_x:490.0, identity_ad_label_y:375.0,
      identity_tc_center_x:490.0, identity_tc_label_y:336.0,
      identity_unvan_center_x:490.0, identity_unvan_label_y:297.0,
      identity_gorev_center_x:490.0, identity_gorev_label_y:258.0,
      taltif_x:100.0, taltif_right:746.0, taltif_start_y:200.0,
      taltif_font_size:13.2, taltif_leading:17.0,
      signature_center_x:415.0, signature_name_y:85.0,
      signature_title1_y:70.0, signature_title2_y:42.0,
      signature_name_size:13.5, signature_title_size:12.5,
      signature_image_center_x:415.0, signature_image_y:82.0,
      signature_image_w:120.0, signature_image_h:120.0,
      page2_date_x:28.32, page2_date_y:515.28,
      page2_number_x:28.32, page2_number_y:498.08,
      page2_approval_heading_y:468.08, page2_approval_date_y:449.88,
      page2_approval_number_y:432.68,
      page2_heading_x:28.32, page2_heading_y:446.88,
      page2_table_x:28.32, page2_table_top:424.98, page2_table_right:813.57,
      page2_legislation_x:28.32, page2_legislation_y:260.0, page2_legislation_right:813.57
    },
    yatay_2: {
      orientation:'landscape', margin_equal:true,
      margin_top_mm:5.0, margin_bottom_mm:5.0, margin_left_mm:5.0, margin_right_mm:5.0,
      photo_x:238.23, photo_y:256.68, photo_w:96.0, photo_h:118.0,
      identity_center_x:525.0, identity_label_start_y:286.0, identity_row_gap:39.0,
      identity_value_offset:17.0, identity_line_offset:21.0,
      identity_line_left:405.0, identity_line_right:645.0,
      identity_label_size:13.2, identity_value_size:13.2,
      identity_ad_center_x:488.89, identity_ad_label_y:382.08,
      identity_tc_center_x:487.78, identity_tc_label_y:346.52,
      identity_unvan_center_x:488.89, identity_unvan_label_y:314.17,
      identity_gorev_center_x:492.22, identity_gorev_label_y:276.28,
      taltif_x:90.0, taltif_right:750.0, taltif_start_y:215.0,
      taltif_font_size:13.2, taltif_leading:17.0,
      signature_center_x:407.88, signature_name_y:93.69,
      signature_title1_y:76.48, signature_title2_y:49.48,
      signature_name_size:13.5, signature_title_size:12.5,
      signature_image_center_x:407.25, signature_image_y:67.49,
      signature_image_w:120.0, signature_image_h:120.0,
      page2_date_x:28.32, page2_date_y:515.28,
      page2_number_x:28.32, page2_number_y:498.08,
      page2_approval_heading_y:468.08, page2_approval_date_y:449.88,
      page2_approval_number_y:432.68,
      page2_heading_x:28.32, page2_heading_y:446.88,
      page2_table_x:28.32, page2_table_top:424.98, page2_table_right:813.57,
      page2_legislation_x:28.32, page2_legislation_y:260.0, page2_legislation_right:813.57
    }
  };
}

function getPdfModel(token, recordId) {
  const u = requireUser_(token);
  ensureFullDefaults_(u.id);
  const prep = prepareRecordForPdf(token, recordId);
  if (!prep || !prep.ok) return prep || fail_('PDF hazırlığı yapılamadı.');

  const r = ownById_('records', u.id, recordId);
  const full = fullSettingsObject_(u.id);
  const type = r.belge_turu === 'USTUN_BASARI' ? 'USTUN_BASARI' : 'BASARI';
  const doc = full.document_by_type[type];
  const templateId = clean_(doc.default_template_id || (type === 'USTUN_BASARI' ? 'dikey_2' : 'dikey_1'));
  const defaultLayouts = getDesktopTemplateLayoutsWeb_();
  const storedLayouts = full.templates && full.templates.layouts ? full.templates.layouts : {};
  const layout = Object.assign({}, defaultLayouts[templateId] || defaultLayouts.dikey_1, storedLayouts[templateId] || {});

  const reasons = full.reasons_by_type[type] || [];
  const signer = resolveSignerForRecordWeb_(full.signers || [], r);
  const approval = getApprovalLetterInfoWeb_(u.id, r.approval_list_id);

  return {
    ok:true,
    record:jsonSafe_(r),
    document_type:type,
    document_label:type === 'USTUN_BASARI' ? 'Üstün Başarı Belgesi' : 'Başarı Belgesi',
    template_id:templateId,
    template_layout:layout,
    template_asset:getTemplateAssetDataWeb_(u.id, templateId),
    photo_data:drivePathDataUrlWeb_(r.foto_path),
    signature_data:(clean_(r.signature_mode).toUpperCase()==='IMAGE') ? drivePathDataUrlWeb_(r.signature_path) : '',
    signer:signer,
    reasons:reasons,
    document_settings:doc,
    approval_letter:approval,
    program:full.program
  };
}

function uploadTemplateAsset(token, templateId, dataUrl, originalName) {
  const u = requireUser_(token);
  templateId = clean_(templateId);
  if (PDF_TEMPLATE_IDS_WEB.indexOf(templateId) < 0) return fail_('Geçersiz şablon.');
  const match = String(dataUrl || '').match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
  if (!match) return fail_('Şablon görseli geçersiz.');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 8*1024*1024) return fail_('Şablon görseli en fazla 8 MB olabilir.');

  const folder = templateFolderWeb_(u.id, u.email);
  const oldId = clean_(getConfigObject_(u.id)['template.asset.'+templateId] || '');
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch(e) {} }

  const ext = match[1].indexOf('png') >= 0 ? '.png' : '.jpg';
  const file = folder.createFile(Utilities.newBlob(bytes, match[1], templateId + ext));
  setConfig_(u.id, 'template.asset.'+templateId, file.getId());
  audit_(u.id,'UPLOAD_TEMPLATE_ASSET','',JSON.stringify({template_id:templateId,name:clean_(originalName)}));
  return {ok:true, template_id:templateId, file_id:file.getId(), name:file.getName()};
}

function getTemplateAssetStatus(token) {
  const u = requireUser_(token);
  const cfg = getConfigObject_(u.id);
  const status = {};
  PDF_TEMPLATE_IDS_WEB.forEach(id => {
    const fid = clean_(cfg['template.asset.'+id] || '');
    let exists = false;
    if (fid) { try { exists = !DriveApp.getFileById(fid).isTrashed(); } catch(e) {} }
    status[id] = {file_id:fid, exists:exists};
  });
  return {ok:true,status:status};
}

function saveGeneratedPdfWeb(token, recordId, base64Pdf, fileName) {
  const u = requireUser_(token);
  const r = ownById_('records',u.id,recordId);
  if (!r) return fail_('Kayıt bulunamadı.');
  if (!clean_(r.sayi)) return fail_('PDF kaydından önce tarih/sayı hazırlanmalıdır.');
  const bytes = Utilities.base64Decode(String(base64Pdf || '').replace(/^data:application\/pdf;base64,/,''));
  if (!bytes.length) return fail_('PDF verisi boş.');
  const folders = ensureUserFolders_(u.id,u.email);
  const safeName = clean_(fileName) || ((r.belge_turu==='USTUN_BASARI'?'Ustun_Basari_':'Basari_') + r.tc_kimlik + '_' + r.yil + '_' + String(r.sayi).padStart(3,'0') + '.pdf');
  const file = folders.documents.createFile(Utilities.newBlob(bytes,'application/pdf',safeName));
  const old = clean_(r.pdf_file_id);
  if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch(e) {} }
  updateById_('records',r.id,{pdf_file_id:file.getId(),updated_at:nowIso_()});
  audit_(u.id,'PDF_CREATED',r.id,file.getId());
  return {ok:true,file_id:file.getId(),name:file.getName()};
}

function getStoredPdfWeb(token, recordId) {
  const u = requireUser_(token);
  const r = ownById_('records',u.id,recordId);
  if (!r || !clean_(r.pdf_file_id)) return fail_('Kayıtlı PDF bulunamadı.');
  try {
    const f = DriveApp.getFileById(r.pdf_file_id);
    return {ok:true,name:f.getName(),base64:Utilities.base64Encode(f.getBlob().getBytes())};
  } catch(e) { return fail_('PDF dosyası okunamadı.'); }
}

function templateFolderWeb_(uid,email) {
  const f = ensureUserFolders_(uid,email).root;
  const it = f.getFoldersByName('Sablonlar');
  return it.hasNext() ? it.next() : f.createFolder('Sablonlar');
}

function getTemplateAssetDataWeb_(uid, templateId) {
  const cfg = getConfigObject_(uid);
  const fid = clean_(cfg['template.asset.'+templateId] || '');
  if (!fid) return '';
  try {
    const blob = DriveApp.getFileById(fid).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch(e) { return ''; }
}

function drivePathDataUrlWeb_(path) {
  path = clean_(path);
  if (!path || path.indexOf('drive:') !== 0) return '';
  try {
    const blob = DriveApp.getFileById(path.substring(6)).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch(e) { return ''; }
}

function resolveSignerForRecordWeb_(signers, record) {
  const explicitName = clean_(record.signer_name);
  if (explicitName) {
    const exact = signers.find(s => clean_(s.name) === explicitName);
    if (exact) return exact;
    return {name:explicitName,title:clean_(record.signer_title),signature_path:clean_(record.signature_path),default_signature_mode:clean_(record.signature_mode)||'WET'};
  }
  const active = signers.find(s => s.active !== false);
  return active || {name:'',title:'',signature_path:'',default_signature_mode:'WET'};
}

function getApprovalLetterInfoWeb_(uid, approvalListId) {
  if (!clean_(approvalListId)) return {date:'',number:''};
  const list = ownById_('approval_lists',uid,approvalListId);
  if (!list) return {date:'',number:''};
  const cfg = getConfigObject_(uid);
  return {
    date:clean_(cfg['approval.'+approvalListId+'.date'] || ''),
    number:clean_(cfg['approval.'+approvalListId+'.number'] || '')
  };
}

function saveApprovalLetterInfoWeb(token, approvalListId, dateText, numberText) {
  const u = requireUser_(token);
  const list = ownById_('approval_lists',u.id,approvalListId);
  if (!list) return fail_('Olur listesi bulunamadı.');
  setConfig_(u.id,'approval.'+approvalListId+'.date',clean_(dateText));
  setConfig_(u.id,'approval.'+approvalListId+'.number',clean_(numberText));
  audit_(u.id,'SAVE_APPROVAL_LETTER_INFO','',JSON.stringify({approval_list_id:approvalListId,date:clean_(dateText),number:clean_(numberText)}));
  return ok_('Olur yazısı bilgileri kaydedildi.');
}
