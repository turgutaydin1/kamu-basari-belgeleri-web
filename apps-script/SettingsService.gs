/*
 * SettingsService.gs
 * system_config.json ve masaüstü Sistem Ayarları ekranının web karşılığı.
 * Yapı JSON olarak config tablosunda tutulur; ileride MySQL'e doğrudan taşınabilir.
 */

function getFullSettings(token) {
  const u = requireUser_(token);
  ensureFullDefaults_(u.id);
  return {ok:true, settings:fullSettingsObject_(u.id)};
}

function saveProgramSettings(token, patch) {
  const u = requireUser_(token);
  patch = patch || {};
  const allowed = ['program_adi','kurum_adi','birim_adi','alt_aciklama','surum','default_gorev_yeri','theme','show_logo','logo_path'];
  allowed.forEach(k => {
    if (patch[k] !== undefined) setConfig_(u.id, `program.${k}`, typeof patch[k] === 'boolean' ? String(patch[k]) : clean_(patch[k]));
  });
  audit_(u.id,'SAVE_PROGRAM_SETTINGS','',JSON.stringify(patch));
  return ok_('Program ve kurum ayarları kaydedildi.');
}

function saveDocumentTypeSettings(token, belgeTuru, patch) {
  const u = requireUser_(token);
  const type = belgeTuru === 'USTUN_BASARI' ? 'USTUN_BASARI' : 'BASARI';
  patch = patch || {};
  const allowed = ['number_format','reset_number_yearly','default_taltif_text','legislation_text','default_template_id'];
  allowed.forEach(k => {
    if (patch[k] !== undefined) setConfig_(u.id, `document.${type}.${k}`, typeof patch[k] === 'boolean' ? String(patch[k]) : String(patch[k] == null ? '' : patch[k]));
  });
  audit_(u.id,'SAVE_DOCUMENT_SETTINGS','',JSON.stringify({type,patch}));
  return ok_(`${type === 'USTUN_BASARI' ? 'Üstün Başarı' : 'Başarı'} Belgesi ayarları kaydedildi.`);
}

function getReasonsByType(token, belgeTuru) {
  const u = requireUser_(token);
  ensureFullDefaults_(u.id);
  const type = belgeTuru === 'USTUN_BASARI' ? 'USTUN_BASARI' : 'BASARI';
  return {ok:true, reasons:jsonConfigArray_(u.id, `reasons.${type}`, defaultReasonsWeb_())};
}

function saveReasonsByType(token, belgeTuru, reasons) {
  const u = requireUser_(token);
  const type = belgeTuru === 'USTUN_BASARI' ? 'USTUN_BASARI' : 'BASARI';
  const cleaned = (Array.isArray(reasons) ? reasons : []).map(clean_).filter(Boolean);
  setConfig_(u.id, `reasons.${type}`, JSON.stringify(cleaned));
  audit_(u.id,'SAVE_REASONS','',JSON.stringify({type,count:cleaned.length}));
  return {ok:true,reasons:cleaned};
}

function getSigners(token) {
  const u = requireUser_(token);
  ensureFullDefaults_(u.id);
  return {ok:true, signers:jsonConfigArray_(u.id,'signers',defaultSignersWeb_())};
}

function saveSigners(token, signers) {
  const u = requireUser_(token);
  const cleaned = (Array.isArray(signers) ? signers : []).map((s,i) => ({
    id: clean_(s.id) || String(i+1),
    name: clean_(s.name),
    title: clean_(s.title),
    start_date: clean_(s.start_date),
    end_date: clean_(s.end_date) || 'Devam Ediyor',
    active: s.active !== false,
    signature_path: clean_(s.signature_path),
    default_signature_mode: clean_(s.default_signature_mode) || 'WET'
  })).filter(s => s.name || s.title);
  setConfig_(u.id,'signers',JSON.stringify(cleaned));
  audit_(u.id,'SAVE_SIGNERS','',JSON.stringify({count:cleaned.length}));
  return {ok:true,signers:cleaned};
}

function getTemplateSettings(token) {
  const u = requireUser_(token);
  ensureFullDefaults_(u.id);
  const cfg = getConfigObject_(u.id);
  const layouts = jsonConfigObject_(u.id,'template.layouts',{});
  return {ok:true,
    default_by_document_type:{
      BASARI:clean_(cfg['document.BASARI.default_template_id'] || cfg.aktif_sablon_basari || 'dikey_1'),
      USTUN_BASARI:clean_(cfg['document.USTUN_BASARI.default_template_id'] || cfg.aktif_sablon_ustun_basari || 'dikey_2')
    },
    templates:[
      {id:'dikey_1',label:'Dikey 1',orientation:'portrait'},
      {id:'dikey_2',label:'Dikey 2',orientation:'portrait'},
      {id:'yatay_1',label:'Yatay 1',orientation:'landscape'},
      {id:'yatay_2',label:'Yatay 2',orientation:'landscape'}
    ],
    layouts:layouts
  };
}

function saveTemplateLayout(token, templateId, layout) {
  const u = requireUser_(token);
  if (['dikey_1','dikey_2','yatay_1','yatay_2'].indexOf(clean_(templateId)) < 0) return fail_('Geçersiz şablon.');
  const all = jsonConfigObject_(u.id,'template.layouts',{});
  all[templateId] = layout || {};
  setConfig_(u.id,'template.layouts',JSON.stringify(all));
  audit_(u.id,'SAVE_TEMPLATE_LAYOUT','',templateId);
  return ok_('Şablon yerleşimi kaydedildi.');
}

function setDefaultTemplateForType(token, belgeTuru, templateId) {
  const u = requireUser_(token);
  const type = belgeTuru === 'USTUN_BASARI' ? 'USTUN_BASARI' : 'BASARI';
  templateId = clean_(templateId);
  if (['dikey_1','dikey_2','yatay_1','yatay_2'].indexOf(templateId) < 0) return fail_('Geçersiz şablon.');
  setConfig_(u.id,`document.${type}.default_template_id`,templateId);
  if (type === 'BASARI') setConfig_(u.id,'aktif_sablon_basari',templateId);
  else setConfig_(u.id,'aktif_sablon_ustun_basari',templateId);
  audit_(u.id,'SET_DEFAULT_TEMPLATE','',JSON.stringify({type,templateId}));
  return ok_('Varsayılan şablon kaydedildi.');
}

function fullSettingsObject_(uid) {
  const cfg = getConfigObject_(uid);
  return {
    program:{
      program_adi:cfg['program.program_adi'] || APP_NAME,
      kurum_adi:cfg['program.kurum_adi'] || cfg.kurum_adi || 'İstanbul Havalimanı Mülki İdare Amirliği',
      birim_adi:cfg['program.birim_adi'] || '',
      alt_aciklama:cfg['program.alt_aciklama'] || 'Belge kayıt, düzenleme ve PDF üretim sistemi',
      surum:cfg['program.surum'] || '1.0',
      default_gorev_yeri:cfg['program.default_gorev_yeri'] || cfg.default_gorev_yeri || 'İstanbul Havalimanı Mülki İdare Amirliği',
      theme:cfg['program.theme'] || 'light',
      show_logo:cfg['program.show_logo'] !== 'false',
      logo_path:cfg['program.logo_path'] || ''
    },
    document_by_type:{
      BASARI:documentSettingsWeb_(cfg,'BASARI'),
      USTUN_BASARI:documentSettingsWeb_(cfg,'USTUN_BASARI')
    },
    signers:jsonConfigArray_(uid,'signers',defaultSignersWeb_()),
    reasons_by_type:{
      BASARI:jsonConfigArray_(uid,'reasons.BASARI',defaultReasonsWeb_()),
      USTUN_BASARI:jsonConfigArray_(uid,'reasons.USTUN_BASARI',defaultReasonsWeb_())
    },
    templates:{
      default_by_document_type:{
        BASARI:cfg['document.BASARI.default_template_id'] || cfg.aktif_sablon_basari || 'dikey_1',
        USTUN_BASARI:cfg['document.USTUN_BASARI.default_template_id'] || cfg.aktif_sablon_ustun_basari || 'dikey_2'
      },
      layouts:jsonConfigObject_(uid,'template.layouts',{})
    }
  };
}

function documentSettingsWeb_(cfg,type) {
  const legacyReward = type === 'USTUN_BASARI' ? cfg.ustun_basari_taltif_metni : cfg.basari_taltif_metni;
  return {
    number_format:cfg[`document.${type}.number_format`] || '{year}/{number:03d}',
    reset_number_yearly:cfg[`document.${type}.reset_number_yearly`] !== 'false',
    default_taltif_text:cfg[`document.${type}.default_taltif_text`] || legacyReward || defaultRewardTextWeb_(),
    legislation_text:cfg[`document.${type}.legislation_text`] || defaultLegislationTextWeb_(),
    default_template_id:cfg[`document.${type}.default_template_id`] || (type === 'USTUN_BASARI' ? 'dikey_2' : 'dikey_1')
  };
}

function ensureFullDefaults_(uid) {
  seedConfig_(uid);
  const defaults = {
    'program.program_adi':APP_NAME,
    'program.kurum_adi':'İstanbul Havalimanı Mülki İdare Amirliği',
    'program.birim_adi':'',
    'program.alt_aciklama':'Belge kayıt, düzenleme ve PDF üretim sistemi',
    'program.surum':'1.0',
    'program.default_gorev_yeri':'İstanbul Havalimanı Mülki İdare Amirliği',
    'program.theme':'light',
    'program.show_logo':'true',
    'document.BASARI.number_format':'{year}/{number:03d}',
    'document.BASARI.reset_number_yearly':'true',
    'document.BASARI.default_taltif_text':defaultRewardTextWeb_(),
    'document.BASARI.legislation_text':defaultLegislationTextWeb_(),
    'document.BASARI.default_template_id':'dikey_1',
    'document.USTUN_BASARI.number_format':'{year}/{number:03d}',
    'document.USTUN_BASARI.reset_number_yearly':'true',
    'document.USTUN_BASARI.default_taltif_text':defaultRewardTextWeb_(),
    'document.USTUN_BASARI.legislation_text':defaultLegislationTextWeb_(),
    'document.USTUN_BASARI.default_template_id':'dikey_2',
    'reasons.BASARI':JSON.stringify(defaultReasonsWeb_()),
    'reasons.USTUN_BASARI':JSON.stringify(defaultReasonsWeb_()),
    'signers':JSON.stringify(defaultSignersWeb_()),
    'template.layouts':'{}'
  };
  const cfg = getConfigObject_(uid);
  Object.keys(defaults).forEach(k => { if (!(k in cfg)) setConfig_(uid,k,defaults[k]); });
}

function defaultReasonsWeb_() {
  return [
    'Kamusal fayda ve gelirlerin beklenenin üzerinde arttırılmasında,',
    'Kamu kaynağında önemli ölçüde tasarruf sağlanmasında,',
    'Sunulan kamu hizmetlerinin etkinlik kalitesinin yükseltilmesine katkı sebebiyle,',
    'Kamu zararının önlenmesinde ve önlenemez kamu zararlarının önemli ölçüde azaltılmasında,'
  ];
}

function defaultRewardTextWeb_() {
  return 'Görev yaptığınız süre zarfında ifa edilen kamu hizmetlerinin kalitesinin yükseltilmesinde göstermiş olduğunuz üstün görev anlayışınız münasebetiyle sizi bu belge ile taltif ediyor, başarılı çalışmalarınızın devamını diliyorum.';
}

function defaultLegislationTextWeb_() {
  return 'Bu belge; 14.08.1997 tarihli ve 23080 sayılı Resmi Gazete’de yayımlanan Sivil Hava Meydanları, Limanlar Ve Sınır Kapılarında Güvenliğin Sağlanması, Görev Ve Hizmetlerin Yürütülmesi Hakkında Yönetmelik’in 12. Maddesine göre düzenlenmiştir.';
}

function defaultSignersWeb_() {
  return [{id:'1',name:'M. İlker HAKTANKAÇMAZ',title:'(Vali-Mülkiye Başmüfettişi)\nMülki İdare Amiri',start_date:'01.01.2023',end_date:'Devam Ediyor',active:true,signature_path:'',default_signature_mode:'WET'}];
}

function jsonConfigArray_(uid,key,fallback) {
  const cfg = getConfigObject_(uid); try { const v=JSON.parse(cfg[key] || ''); return Array.isArray(v) ? v : fallback; } catch(e){ return fallback; }
}
function jsonConfigObject_(uid,key,fallback) {
  const cfg = getConfigObject_(uid); try { const v=JSON.parse(cfg[key] || ''); return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback; } catch(e){ return fallback; }
}
