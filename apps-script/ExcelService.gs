/*
 * ExcelService.gs
 * Masaüstü app.py içindeki Excel toplu aktarım davranışının Apps Script karşılığı.
 * Tarayıcı .xlsx dosyasını satır nesnelerine çevirir; doğrulama ve kayıt bu serviste yapılır.
 */

const EXCEL_SUPERIOR_AUTO_OVERRIDE_REASON_WEB = 'Kişinin sistem dışında, sistem öncesinde veya başka kurum/kurumlardan alınmış Başarı Belgeleri bulunmaktadır.';

const EXCEL_COLUMN_ALIASES_WEB = {
  TC_KIMLIK: ['TC_KIMLIK_NO','TC_KIMLIK','T_C_KIMLIK_NO','TCKN','TC'],
  AD_SOYAD: ['AD_SOYAD','ADI_SOYADI','AD_VE_SOYAD','ADSOYAD'],
  UNVAN: ['UNVAN','UNVANI'],
  GOREV_YERI: ['GOREV_YERI','GOREVYERI'],
  TARIH: ['TARIH','BELGE_TARIHI'],
  SAYI: ['SAYI','SAYI_NO','BELGE_NO','BELGE_SAYISI'],
  GEREKCE: ['GEREKCE','VERILME_GEREKCESI'],
  TALTIF_METNI: ['TALTIF_METNI','TALTIF','BELGE_METNI'],
  BELGE_TURU: ['BELGE_TURU','BELGETURU','TUR','BELGE_CINSI']
};

function buildExcelPreviewFromRows(token, rawRows) {
  const u = requireUser_(token);
  const rows = Array.isArray(rawRows) ? rawRows : [];
  if (!rows.length) return fail_('Excel dosyasında aktarılacak satır bulunamadı.');

  const cfg = getConfigObject_(u.id);
  const headerMap = excelHeaderMap_(rows[0]);
  const required = ['TC_KIMLIK','AD_SOYAD','UNVAN','GOREV_YERI'];
  const missing = required.filter(k => !headerMap[k]);
  if (missing.length) {
    const readable = {TC_KIMLIK:'TC KİMLİK NO',AD_SOYAD:'AD-SOYAD',UNVAN:'UNVAN',GOREV_YERI:'GÖREV YERİ'};
    return fail_('Zorunlu sütunlar eksik: ' + missing.map(k=>readable[k]).join(', '));
  }

  const preview = [];
  const prepared = [];
  const errors = [];
  const seenTc = {};
  const reservedBasis = {};

  rows.forEach((source, index) => {
    const rowNo = index + 2;
    const tc = cleanTc_(excelValue_(source, headerMap.TC_KIMLIK));
    const ad = formatPersonNameWeb_(excelValue_(source, headerMap.AD_SOYAD));
    const unvan = formatRecordTitleWeb_(excelValue_(source, headerMap.UNVAN));
    const gorev = formatRecordTitleWeb_(excelValue_(source, headerMap.GOREV_YERI));
    const parsedType = parseExcelDocumentTypeWeb_(excelValue_(source, headerMap.BELGE_TURU));
    const belge = parsedType.value || 'BASARI';
    const dateInfo = parseExcelDateWeb_(excelValue_(source, headerMap.TARIH));
    const enteredNumber = positiveIntWeb_(excelValue_(source, headerMap.SAYI));
    const reason = clean_(excelValue_(source, headerMap.GEREKCE));

    const defaultReward = belge === 'USTUN_BASARI'
      ? clean_(cfg.ustun_basari_taltif_metni || cfg.basari_taltif_metni || '')
      : clean_(cfg.basari_taltif_metni || '');
    const reward = clean_(excelValue_(source, headerMap.TALTIF_METNI)) || defaultReward;

    const rowErrors = [];
    if (parsedType.error) rowErrors.push(parsedType.error);
    if (!tc) rowErrors.push('T.C. Kimlik No boş bırakılamaz.');
    else if (!/^\d{11}$/.test(tc)) rowErrors.push('T.C. Kimlik No 11 haneli ve yalnız rakamlardan oluşmalıdır.');
    if (!ad) rowErrors.push('Ad Soyad boş bırakılamaz.');
    if (!unvan) rowErrors.push('Ünvan boş bırakılamaz.');
    if (!gorev) rowErrors.push('Görev Yeri boş bırakılamaz.');
    if (!reward) rowErrors.push('Taltif metni boş bırakılamaz.');
    if (!dateInfo.ok) rowErrors.push('Tarih geçerli değil.');

    if (tc) {
      if (seenTc[tc] && normalizeNameWeb_(seenTc[tc]) !== normalizeNameWeb_(ad)) {
        rowErrors.push('Excel dosyasında bu T.C. kimlik numarası farklı kişiler için kullanılmış.');
      } else if (!seenTc[tc]) {
        seenTc[tc] = ad;
      }

      const existingNames = ownRows_('records', u.id)
        .filter(r => r.tc_kimlik === tc)
        .map(r => clean_(r.ad_soyad))
        .filter(Boolean);
      if (existingNames.length && existingNames.every(n => normalizeNameWeb_(n) !== normalizeNameWeb_(ad))) {
        rowErrors.push('Bu T.C. kimlik numarası sistemde farklı bir Ad Soyad ile kayıtlı.');
      }
    }

    if (enteredNumber && dateInfo.year) {
      const duplicateNo = ownRows_('records', u.id).some(r =>
        r.belge_turu === belge && Number(r.yil || 0) === Number(dateInfo.year) && Number(r.sayi || 0) === Number(enteredNumber) && r.status !== 'IPTAL'
      );
      if (duplicateNo) rowErrors.push(`${dateInfo.year}/${String(enteredNumber).padStart(3,'0')} belge numarası ${belge === 'USTUN_BASARI' ? 'Üstün Başarı Belgesi' : 'Başarı Belgesi'} içinde sistemde zaten kayıtlı.`);
    }

    let superiorBasisRefs = [];
    let superiorOverrideReason = '';
    let superiorInfo = '';

    if (belge === 'USTUN_BASARI' && rowErrors.length === 0) {
      const eligible = eligibleSuperiorSources_(u.id, tc)
        .filter(r => !reservedBasis[String(r.id)]);
      if (eligible.length >= 3) {
        superiorBasisRefs = eligible.slice(0,3).map(r=>String(r.id));
        superiorBasisRefs.forEach(id=>reservedBasis[id]=true);
        superiorInfo = '3 geçerli sistem dayanağı otomatik eşleştirildi';
      } else {
        superiorBasisRefs = eligible.map(r=>String(r.id));
        superiorBasisRefs.forEach(id=>reservedBasis[id]=true);
        superiorOverrideReason = EXCEL_SUPERIOR_AUTO_OVERRIDE_REASON_WEB;
        superiorInfo = superiorBasisRefs.length
          ? `${superiorBasisRefs.length} sistem dayanağı eşleştirildi + eksik dayanaklar için sabit gerekçe otomatik uygulandı`
          : 'Sistem dayanağı yok; sabit gerekçe otomatik uygulandı';
      }

      const priorSuperiorCount = ownRows_('records', u.id)
        .filter(r => r.tc_kimlik === tc && r.belge_turu === 'USTUN_BASARI' && r.status !== 'IPTAL').length;
      if (priorSuperiorCount) superiorInfo += `${superiorInfo ? ' • ' : ''}Daha önce ${priorSuperiorCount} Üstün Başarı Belgesi var`;
    }

    const preparedItem = {
      BELGE_TURU: belge,
      TC_KIMLIK: tc,
      AD_SOYAD: ad,
      UNVAN: unvan,
      GOREV_YERI: gorev,
      TARIH: dateInfo.text,
      YIL: dateInfo.year,
      SAYI_INT: enteredNumber || '',
      GEREKCE: reason,
      TALTIF_METNI: reward,
      _SUPERIOR_BASIS_REFS: superiorBasisRefs,
      _SUPERIOR_OVERRIDE_REASON: superiorOverrideReason
    };

    preview.push({
      SATIR: rowNo,
      'BELGE TÜRÜ': belge === 'USTUN_BASARI' ? 'Üstün Başarı Belgesi' : 'Başarı Belgesi',
      'TC KİMLİK NO': tc,
      'AD-SOYAD': ad,
      UNVAN: unvan,
      'GÖREV YERİ': gorev,
      'TARİH': dateInfo.text,
      SAYI: enteredNumber ? String(enteredNumber).padStart(3,'0') : 'Otomatik',
      'VERİLME GEREKÇESİ': reason,
      'ÜSTÜN BAŞARI DAYANAK': superiorInfo,
      'TALTİF METNİ': reward,
      DURUM: rowErrors.length ? 'Hatalı' : 'Uygun',
      HATA: rowErrors.join(' | ')
    });

    if (rowErrors.length) errors.push(`Satır ${rowNo}: ${rowErrors.join(' | ')}`);
    else prepared.push(preparedItem);
  });

  return {ok:true, preview, prepared, errors};
}

function importPreparedExcelRows(token, preparedRows) {
  const u = requireUser_(token);
  const rows = Array.isArray(preparedRows) ? preparedRows : [];
  let imported = 0;
  const errors = [];

  rows.forEach((item, index) => {
    try {
      const currentUser = findOne_('users', r => String(r.id) === String(u.id));
      enforceTrial_(currentUser);
      const belge = item.BELGE_TURU === 'USTUN_BASARI' ? 'USTUN_BASARI' : 'BASARI';
      const tc = cleanTc_(item.TC_KIMLIK);
      const ad = clean_(item.AD_SOYAD);
      if (!/^\d{11}$/.test(tc)) throw new Error('T.C. Kimlik No geçersiz.');
      if (!ad || !clean_(item.UNVAN) || !clean_(item.GOREV_YERI) || !clean_(item.TALTIF_METNI)) throw new Error('Zorunlu alanlardan biri boş.');

      const id = uuid_();
      append_('records', {
        id, user_id:u.id, belge_turu:belge, tc_kimlik:tc, ad_soyad:ad,
        unvan:clean_(item.UNVAN), gorev_yeri:clean_(item.GOREV_YERI),
        tarih:'', yil:'', sayi:'', gerekce:clean_(item.GEREKCE), taltif_metni:clean_(item.TALTIF_METNI),
        foto_path:'', signature_mode:'WET', signer_name:'', signer_title:'', signature_path:'',
        status:'TASLAK', finalized_at:'', reopened_at:'', reopen_reason:'', cancelled_at:'', cancel_reason:'',
        record_fingerprint:fingerprint_(belge,tc,ad,clean_(item.GOREV_YERI)), created_at:nowIso_(), updated_at:nowIso_(), delivered_at:'', approval_list_id:'', pdf_file_id:''
      });

      const refs = Array.isArray(item._SUPERIOR_BASIS_REFS) ? item._SUPERIOR_BASIS_REFS.map(String) : [];
      const overrideReason = clean_(item._SUPERIOR_OVERRIDE_REASON);
      if (belge === 'USTUN_BASARI') {
        refs.forEach(ref => append_('superior_basis', {id:uuid_(),user_id:u.id,superior_record_id:id,source_type:'RECORD',source_id:ref,created_at:nowIso_()}));
        if (overrideReason) {
          append_('superior_basis', {id:uuid_(),user_id:u.id,superior_record_id:id,source_type:'MANUAL_OVERRIDE',source_id:0,created_at:nowIso_()});
          audit_(u.id,'SUPERIOR_MANUAL_OVERRIDE',id,JSON.stringify({reason:overrideReason,note:'Excel ile toplu aktarım'}));
        } else if (refs.length !== 3) {
          throw new Error('Üstün Başarı Belgesi için 3 sistem dayanağı bulunamadı.');
        }
      }

      incrementUsage_(u.id);
      audit_(u.id,'EXCEL_IMPORT_DRAFT',id,`Excel toplu aktarım satırı ${index+1}`);
      imported++;
    } catch (e) {
      errors.push(`${index+1}. uygun kayıt aktarılamadı: ${e.message}`);
    }
  });

  return {ok:true, imported, errors};
}

function excelHeaderMap_(sample) {
  const out = {};
  const keys = Object.keys(sample || {});
  Object.keys(EXCEL_COLUMN_ALIASES_WEB).forEach(logical => {
    const aliases = EXCEL_COLUMN_ALIASES_WEB[logical];
    out[logical] = keys.find(k => aliases.indexOf(normalizeExcelHeaderWeb_(k)) >= 0) || '';
  });
  return out;
}

function excelValue_(row, key) { return key ? row[key] : ''; }

function normalizeExcelHeaderWeb_(value) {
  return String(value == null ? '' : value).trim().toUpperCase()
    .replace(/İ/g,'I').replace(/Ş/g,'S').replace(/Ğ/g,'G').replace(/Ü/g,'U').replace(/Ö/g,'O').replace(/Ç/g,'C')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

function parseExcelDocumentTypeWeb_(value) {
  const text = clean_(value);
  if (!text) return {value:'BASARI',error:''};
  const n = normalizeExcelHeaderWeb_(text);
  if (['BASARI','BASARI_BELGESI','BASARI_BELGE'].indexOf(n)>=0) return {value:'BASARI',error:''};
  if (['USTUN_BASARI','USTUN_BASARI_BELGESI','USTUNBASARI','USTUNBASARIBELGESI'].indexOf(n)>=0) return {value:'USTUN_BASARI',error:''};
  return {value:'',error:'Belge Türü geçerli değil. Başarı Belgesi veya Üstün Başarı Belgesi yazınız.'};
}

function parseExcelDateWeb_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return {ok:true,text:formatDateTR_(value),year:value.getFullYear()};
  const raw = clean_(value);
  if (!raw) {
    const d = new Date(); return {ok:true,text:formatDateTR_(d),year:d.getFullYear()};
  }
  let m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
    if (d.getFullYear()===Number(m[3]) && d.getMonth()===Number(m[2])-1 && d.getDate()===Number(m[1])) return {ok:true,text:formatDateTR_(d),year:d.getFullYear()};
  }
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    if (!isNaN(d.getTime())) return {ok:true,text:formatDateTR_(d),year:d.getFullYear()};
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return {ok:true,text:formatDateTR_(parsed),year:parsed.getFullYear()};
  return {ok:false,text:'',year:0};
}

function positiveIntWeb_(value) {
  const text = clean_(value).replace(/\.0$/,'');
  if (!/^\d+$/.test(text)) return 0;
  const n = Number(text); return n > 0 ? n : 0;
}

function formatPersonNameWeb_(value) {
  const parts = clean_(value).replace(/\s+/g,' ').split(' ').filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].toLocaleUpperCase('tr-TR');
  const surname = parts.pop().toLocaleUpperCase('tr-TR');
  const names = parts.map(p => p.charAt(0).toLocaleUpperCase('tr-TR') + p.slice(1).toLocaleLowerCase('tr-TR')).join(' ');
  return `${names} ${surname}`.trim();
}

function formatRecordTitleWeb_(value) {
  const s = clean_(value).replace(/\s+/g,' ');
  if (!s) return '';
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

function normalizeNameWeb_(value) {
  return clean_(value).toLocaleUpperCase('tr-TR').replace(/\s+/g,' ');
}
