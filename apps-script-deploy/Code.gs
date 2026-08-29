
/* ===== Code.gs ===== */
const APP_NAME = 'Kamu Kurumları Başarı Belgeleri Düzenleme ve Takip Sistemi';
const TRIAL_DAYS = 7;
const TRIAL_RECORD_LIMIT = 10;
const SESSION_HOURS = 24 * 7;
const APPROVAL_EDIT_DAYS = 3;

const TABLES = {
  users: ['id','email','full_name','password_hash','role','plan','active','created_at','trial_ends_at','record_limit','records_created'],
  sessions: ['token','user_id','created_at','expires_at'],
  records: ['id','user_id','belge_turu','tc_kimlik','ad_soyad','unvan','gorev_yeri','tarih','yil','sayi','gerekce','taltif_metni','foto_path','signature_mode','signer_name','signer_title','signature_path','status','finalized_at','reopened_at','reopen_reason','cancelled_at','cancel_reason','record_fingerprint','created_at','updated_at','delivered_at','approval_list_id','pdf_file_id'],
  approval_lists: ['id','user_id','belge_turu','created_at','created_by_action','note'],
  approval_list_items: ['id','user_id','approval_list_id','record_id','sira_no','ad_soyad','tc_kimlik','gorev_yeri','unvan','tarih','yil','sayi','removed_at','removed_reason','created_at'],
  counters: ['user_id','belge_turu','yil','last_number'],
  superior_basis: ['id','user_id','superior_record_id','source_type','source_id','created_at'],
  achievement_history: ['id','user_id','tc_kimlik','ad_soyad','kurum','tarih','belge_sayi','kaynak','dogrulama','notlar','created_at','updated_at'],
  audit_log: ['id','user_id','action','record_id','details','created_at'],
  config: ['user_id','key','value','updated_at']
};

function doGet() {
  ensureSystem_();
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function setupSystem(adminEmail, adminPassword) {
  ensureSystem_();
  adminEmail = clean_(adminEmail).toLowerCase();
  adminPassword = String(adminPassword || '');
  if (!validEmail_(adminEmail)) throw new Error('Geçerli e-posta girin.');
  if (adminPassword.length < 8) throw new Error('Parola en az 8 karakter olmalıdır.');
  const users = table_('users');
  let row = findOne_('users', r => clean_(r.email).toLowerCase() === adminEmail);
  const ph = makePassword_(adminPassword);
  if (!row) {
    append_('users', {
      id: uuid_(), email: adminEmail, full_name: 'Sistem Yöneticisi', password_hash: ph,
      role: 'ADMIN', plan: 'FULL', active: true, created_at: nowIso_(), trial_ends_at: '',
      record_limit: 0, records_created: 0
    });
  } else {
    updateById_('users', row.id, {password_hash: ph, role: 'ADMIN', plan: 'FULL', active: true});
  }
  return ok_('Sistem hazır.');
}

function registerUser(fullName, email, password) {
  ensureSystem_();
  fullName = clean_(fullName); email = clean_(email).toLowerCase(); password = String(password || '');
  if (fullName.length < 3) return fail_('Ad Soyad girin.');
  if (!validEmail_(email)) return fail_('Geçerli e-posta girin.');
  if (password.length < 8) return fail_('Parola en az 8 karakter olmalıdır.');
  if (findOne_('users', r => clean_(r.email).toLowerCase() === email)) return fail_('Bu e-posta zaten kayıtlı.');
  const id = uuid_();
  append_('users', {
    id, email, full_name: fullName, password_hash: makePassword_(password), role: 'USER', plan: 'TRIAL', active: true,
    created_at: nowIso_(), trial_ends_at: new Date(Date.now() + TRIAL_DAYS*86400000).toISOString(),
    record_limit: TRIAL_RECORD_LIMIT, records_created: 0
  });
  ensureUserFolders_(id, email);
  seedConfig_(id);
  audit_(id, 'REGISTER', '', email);
  return ok_('Demo hesabı oluşturuldu.');
}

function loginUser(email, password) {
  email = clean_(email).toLowerCase();
  const user = findOne_('users', r => clean_(r.email).toLowerCase() === email);
  if (!user || !checkPassword_(String(password || ''), clean_(user.password_hash))) return fail_('E-posta veya parola hatalı.');
  assertUserUsable_(user);
  const token = uuid_() + uuid_();
  append_('sessions', {token, user_id: user.id, created_at: nowIso_(), expires_at: new Date(Date.now()+SESSION_HOURS*3600000).toISOString()});
  return {ok:true, token, user:safeUser_(user)};
}

function getSession(token) {
  const u = sessionUser_(token);
  return u ? {ok:true, user:safeUser_(u)} : fail_('Oturum bulunamadı.');
}

function logoutUser(token) {
  deleteWhere_('sessions', r => r.token === clean_(token));
  return {ok:true};
}

function getDashboard(token) {
  const u = requireUser_(token);
  const rows = ownRows_('records', u.id);
  const year = new Date().getFullYear();
  return {ok:true, user:safeUser_(u), stats:{
    year,
    total: rows.length,
    draft: rows.filter(r=>r.status==='TASLAK').length,
    approval: rows.filter(r=>r.status==='OLUR_LISTESINDE').length,
    delivered: rows.filter(r=>r.status==='TESLIM_EDILDI').length,
    cancelled: rows.filter(r=>r.status==='IPTAL').length,
    success: rows.filter(r=>r.belge_turu==='BASARI').length,
    superior: rows.filter(r=>r.belge_turu==='USTUN_BASARI').length,
    created_this_year: rows.filter(r=>yearOf_(r.created_at)===year).length,
    delivered_this_year: rows.filter(r=>yearOf_(r.delivered_at)===year).length
  }};
}

function globalSearch(token, query) {
  const u = requireUser_(token); query = clean_(query).toLocaleLowerCase('tr-TR');
  if (!query) return {ok:true, records:[]};
  const rows = ownRows_('records', u.id).filter(r => {
    const hay = [r.ad_soyad,r.tc_kimlik,r.unvan,r.gorev_yeri,recordNo_(r)].join(' ').toLocaleLowerCase('tr-TR');
    return hay.indexOf(query) >= 0;
  }).slice(0,15);
  return {ok:true, records:rows.map(jsonSafe_)};
}

function getPersonProfile(token, tc) {
  const u = requireUser_(token); tc = cleanTc_(tc);
  const rows = ownRows_('records', u.id).filter(r=>r.tc_kimlik===tc).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
  if (!rows.length) return {ok:true, profile:null};
  const r = rows[0];
  return {ok:true, profile:{ad_soyad:r.ad_soyad, unvan:r.unvan, gorev_yeri:r.gorev_yeri, foto_path:r.foto_path}};
}

function createRecord(token, data) {
  const u = requireUser_(token); enforceTrial_(u); data = data || {};
  const tc = cleanTc_(data.tc_kimlik);
  if (!/^\d{11}$/.test(tc)) return fail_('T.C. Kimlik No 11 haneli olmalıdır.');
  if (!clean_(data.ad_soyad)) return fail_('Ad Soyad zorunludur.');
  const belge = data.belge_turu === 'USTUN_BASARI' ? 'USTUN_BASARI' : 'BASARI';
  const id = uuid_();
  const superior = belge === 'USTUN_BASARI';
  const manual = !!data.superior_manual_override;
  const sources = Array.isArray(data.superior_basis_refs) ? data.superior_basis_refs.map(String) : [];
  if (superior && !manual) {
    const eligible = eligibleSuperiorSources_(u.id, tc).map(r=>String(r.id));
    const valid = [...new Set(sources.filter(x=>eligible.indexOf(x)>=0))];
    if (valid.length !== 3) return fail_('Üstün Başarı Belgesi için tam olarak 3 geçerli Başarı Belgesi dayanak seçilmelidir.');
  }
  append_('records', {
    id, user_id:u.id, belge_turu:belge, tc_kimlik:tc, ad_soyad:clean_(data.ad_soyad), unvan:clean_(data.unvan),
    gorev_yeri:clean_(data.gorev_yeri), tarih:'', yil:'', sayi:'', gerekce:clean_(data.gerekce),
    taltif_metni:clean_(data.taltif_metni), foto_path:clean_(data.foto_path), signature_mode:clean_(data.signature_mode)||'WET',
    signer_name:clean_(data.signer_name), signer_title:clean_(data.signer_title), signature_path:clean_(data.signature_path),
    status:'TASLAK', finalized_at:'', reopened_at:'', reopen_reason:'', cancelled_at:'', cancel_reason:'',
    record_fingerprint:fingerprint_(belge,tc,clean_(data.ad_soyad),clean_(data.gorev_yeri)), created_at:nowIso_(), updated_at:nowIso_(), delivered_at:'', approval_list_id:'', pdf_file_id:''
  });
  if (superior) {
    if (manual) {
      append_('superior_basis',{id:uuid_(),user_id:u.id,superior_record_id:id,source_type:'MANUAL_OVERRIDE',source_id:0,created_at:nowIso_()});
      audit_(u.id,'SUPERIOR_MANUAL_OVERRIDE',id,JSON.stringify({reason:clean_(data.superior_override_reason),note:clean_(data.superior_override_note)}));
    } else {
      [...new Set(sources)].forEach(s=>append_('superior_basis',{id:uuid_(),user_id:u.id,superior_record_id:id,source_type:'RECORD',source_id:s,created_at:nowIso_()}));
    }
  }
  incrementUsage_(u.id);
  audit_(u.id,'CREATE_DRAFT',id,tc);
  return {ok:true,id,message:'Taslak kayıt oluşturuldu.'};
}

function listRecords(token, status) {
  const u = requireUser_(token);
  let rows = ownRows_('records', u.id);
  if (status) rows = rows.filter(r=>r.status===status);
  rows.sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
  return {ok:true, records:rows.map(jsonSafe_)};
}

function moveToApproval(token, recordIds, note) {
  const u = requireUser_(token); const ids = uniq_(recordIds||[]);
  const rows = ids.map(id=>ownById_('records',u.id,id)).filter(Boolean);
  if (!rows.length) return fail_('Kayıt seçilmedi.');
  if (rows.some(r=>r.status!=='TASLAK')) return fail_('Yalnız Taslak kayıtlar Olur listesine eklenebilir.');
  if (rows.some(r=>!clean_(r.foto_path))) return fail_('Olur listesine eklemeden önce fotoğraf zorunludur.');
  const types = uniq_(rows.map(r=>r.belge_turu));
  if (types.length!==1) return fail_('Başarı ve Üstün Başarı kayıtları aynı Olur listesinde birleştirilemez.');
  const listId = uuid_();
  append_('approval_lists',{id:listId,user_id:u.id,belge_turu:types[0],created_at:nowIso_(),created_by_action:'MANUAL',note:clean_(note)});
  rows.forEach((r,i)=>{
    append_('approval_list_items',{id:uuid_(),user_id:u.id,approval_list_id:listId,record_id:r.id,sira_no:i+1,ad_soyad:r.ad_soyad,tc_kimlik:r.tc_kimlik,gorev_yeri:r.gorev_yeri,unvan:r.unvan,tarih:'',yil:'',sayi:'',removed_at:'',removed_reason:'',created_at:nowIso_()});
    updateById_('records',r.id,{status:'OLUR_LISTESINDE',finalized_at:nowIso_(),approval_list_id:listId,updated_at:nowIso_()});
    audit_(u.id,'MOVE_TO_APPROVAL',r.id,listId);
  });
  return {ok:true, approval_list_id:listId, count:rows.length};
}

function returnToDraft(token, recordId, reason) {
  const u = requireUser_(token); const r = ownById_('records',u.id,recordId);
  if (!r || r.status!=='OLUR_LISTESINDE') return fail_('Olur Listesinde kayıt bulunamadı.');
  if (!withinDays_(r.finalized_at, APPROVAL_EDIT_DAYS)) return fail_('Kayıt yalnızca Olur Listesine eklendikten sonraki 3 gün içinde Taslağa döndürülebilir.');
  if (isUsedAsSuperiorBasis_(u.id,r.id)) return fail_('Bu Başarı Belgesi aktif bir Üstün Başarı Belgesine dayanak olduğu için Taslağa döndürülemez.');
  updateById_('records',r.id,{status:'TASLAK',reopened_at:nowIso_(),reopen_reason:clean_(reason),approval_list_id:'',updated_at:nowIso_()});
  markApprovalItemRemoved_(u.id,r.id,clean_(reason)||'Taslağa döndürüldü');
  audit_(u.id,'RETURN_TO_DRAFT',r.id,clean_(reason));
  return ok_('Kayıt Taslağa döndürüldü.');
}

function prepareRecordForPdf(token, recordId) {
  const u = requireUser_(token); let r = ownById_('records',u.id,recordId);
  if (!r || r.status!=='OLUR_LISTESINDE') return fail_('PDF yalnız Olur Listesindeki kayıt için hazırlanabilir.');
  if (!r.sayi) {
    const n = nextNumber_(u.id,r.belge_turu);
    const tarih = formatDateTR_(new Date());
    updateById_('records',r.id,{tarih,yil:n.yil,sayi:n.sayi,updated_at:nowIso_()});
    updateApprovalItemNumber_(u.id,r.id,tarih,n.yil,n.sayi);
    audit_(u.id,'ASSIGN_NUMBER',r.id,`${n.yil}/${String(n.sayi).padStart(3,'0')}`);
    r = ownById_('records',u.id,recordId);
  }
  return {ok:true, record:jsonSafe_(r), config:getConfigObject_(u.id)};
}

function markDelivered(token, recordIds) {
  const u = requireUser_(token); let count=0;
  uniq_(recordIds||[]).forEach(id=>{
    const r = ownById_('records',u.id,id);
    if (r && r.status==='OLUR_LISTESINDE' && r.sayi) {
      updateById_('records',r.id,{status:'TESLIM_EDILDI',delivered_at:nowIso_(),updated_at:nowIso_()});
      audit_(u.id,'DELIVERED',r.id,''); count++;
    }
  });
  return count ? {ok:true,count} : fail_('Uygun kayıt bulunamadı.');
}

function cancelRecord(token, recordId, reason) {
  const u = requireUser_(token); const r=ownById_('records',u.id,recordId);
  if (!r) return fail_('Kayıt bulunamadı.');
  updateById_('records',r.id,{status:'IPTAL',cancelled_at:nowIso_(),cancel_reason:clean_(reason),updated_at:nowIso_()});
  audit_(u.id,'CANCEL',r.id,clean_(reason)); return ok_('Kayıt iptal edildi.');
}

function eligibleSuperiorSources(token, tc) {
  const u=requireUser_(token); return {ok:true,records:eligibleSuperiorSources_(u.id,cleanTc_(tc)).map(jsonSafe_)};
}

function uploadUserFile(token, dataUrl, fileName, kind) {
  const u=requireUser_(token); const m=String(dataUrl||'').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return fail_('Dosya verisi geçersiz.');
  const bytes=Utilities.base64Decode(m[2]);
  if (bytes.length>6*1024*1024) return fail_('Dosya en fazla 6 MB olabilir.');
  const f=ensureUserFolders_(u.id,u.email); const folder = kind==='signature'?f.signatures:kind==='pdf'?f.documents:f.photos;
  const file=folder.createFile(Utilities.newBlob(bytes,m[1],clean_(fileName)||'dosya'));
  return {ok:true,file_id:file.getId(),name:file.getName(),path:`drive:${file.getId()}`};
}

function getSettings(token) { const u=requireUser_(token); seedConfig_(u.id); return {ok:true,config:getConfigObject_(u.id)}; }
function saveSettings(token, patch) { const u=requireUser_(token); Object.keys(patch||{}).forEach(k=>setConfig_(u.id,k,patch[k])); audit_(u.id,'SAVE_SETTINGS','',JSON.stringify(patch||{})); return {ok:true}; }

function getAdminUsers(token) { const u=requireUser_(token); if(u.role!=='ADMIN') throw new Error('Yetkisiz işlem.'); return {ok:true,users:rows_('users').map(safeUser_)}; }
function adminUpdateUser(token,userId,plan,days,recordLimit,active){ const a=requireUser_(token); if(a.role!=='ADMIN') throw new Error('Yetkisiz işlem.'); const p=clean_(plan).toUpperCase(); if(['TRIAL','FULL','BLOCKED'].indexOf(p)<0) throw new Error('Geçersiz plan.'); const patch={plan:p,active:p==='BLOCKED'?false:!!active,record_limit:Number(recordLimit||TRIAL_RECORD_LIMIT)}; if(p==='TRIAL') patch.trial_ends_at=new Date(Date.now()+Number(days||TRIAL_DAYS)*86400000).toISOString(); if(p==='FULL') patch.trial_ends_at=''; updateById_('users',userId,patch); return {ok:true}; }

function ensureSystem_(){ db_(); rootFolder_(); }
function db_(){ const p=PropertiesService.getScriptProperties(); let id=p.getProperty('DATABASE_ID'),ss; try{if(id)ss=SpreadsheetApp.openById(id);}catch(e){} if(!ss){ss=SpreadsheetApp.create(APP_NAME+' - Veritabanı');p.setProperty('DATABASE_ID',ss.getId());} Object.keys(TABLES).forEach(n=>ensureSheet_(ss,n,TABLES[n])); return ss; }
function ensureSheet_(ss,name,headers){ let sh=ss.getSheetByName(name)||ss.insertSheet(name); if(sh.getLastRow()===0){sh.getRange(1,1,1,headers.length).setValues([headers]);sh.setFrozenRows(1);} else {const cur=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(String);headers.forEach(h=>{if(cur.indexOf(h)<0)sh.getRange(1,sh.getLastColumn()+1).setValue(h);});} return sh; }
function table_(name){return db_().getSheetByName(name);} function rows_(name){const sh=table_(name),v=sh.getDataRange().getValues();if(v.length<2)return[];const h=v[0].map(String);return v.slice(1).filter(r=>r.some(x=>x!=='')) .map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]);return o;});}
function append_(name,obj){const sh=table_(name),h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);sh.appendRow(h.map(k=>obj[k]===undefined?'':obj[k]));}
function findOne_(name,pred){return rows_(name).find(pred)||null;} function ownRows_(name,uid){return rows_(name).filter(r=>String(r.user_id)===String(uid));} function ownById_(name,uid,id){return ownRows_(name,uid).find(r=>String(r.id)===String(id))||null;}
function updateById_(name,id,patch){const sh=table_(name),v=sh.getDataRange().getValues(),h=v[0].map(String),ci=h.indexOf('id');for(let i=1;i<v.length;i++){if(String(v[i][ci])===String(id)){Object.keys(patch).forEach(k=>{const c=h.indexOf(k);if(c>=0)sh.getRange(i+1,c+1).setValue(patch[k]);});return true;}}return false;}
function deleteWhere_(name,pred){const sh=table_(name),all=rows_(name);for(let i=all.length-1;i>=0;i--){if(pred(all[i]))sh.deleteRow(i+2);}}
function sessionUser_(token){const s=findOne_('sessions',r=>r.token===clean_(token)&&Date.parse(r.expires_at)>Date.now()); if(!s)return null; const u=findOne_('users',r=>String(r.id)===String(s.user_id)); if(!u)return null; try{assertUserUsable_(u);return u;}catch(e){return null;}}
function requireUser_(token){const u=sessionUser_(token);if(!u)throw new Error('Oturum süresi dolmuş. Yeniden giriş yapın.');return u;}
function assertUserUsable_(u){if(!truthy_(u.active)||u.plan==='BLOCKED')throw new Error('Üyelik kullanıma kapalı.');if(u.plan==='TRIAL'&&Date.parse(u.trial_ends_at)<Date.now())throw new Error('Deneme süresi sona ermiş.');}
function enforceTrial_(u){if(u.plan==='FULL')return;if(u.plan!=='TRIAL')throw new Error('Yeni kayıt yetkisi yok.');if(Number(u.records_created||0)>=Number(u.record_limit||0))throw new Error('Deneme kayıt limiti doldu.');}
function incrementUsage_(uid){const u=findOne_('users',r=>String(r.id)===String(uid));if(u)updateById_('users',u.id,{records_created:Number(u.records_created||0)+1});}
function eligibleSuperiorSources_(uid,tc){return ownRows_('records',uid).filter(r=>r.tc_kimlik===tc&&r.belge_turu==='BASARI'&&r.status==='TESLIM_EDILDI'&&!isUsedAsSuperiorBasis_(uid,r.id));}
function isUsedAsSuperiorBasis_(uid,recordId){const ids=ownRows_('superior_basis',uid).filter(b=>b.source_type==='RECORD'&&String(b.source_id)===String(recordId)).map(b=>String(b.superior_record_id)); return ownRows_('records',uid).some(r=>ids.indexOf(String(r.id))>=0&&r.status!=='IPTAL');}
function markApprovalItemRemoved_(uid,recordId,reason){const x=ownRows_('approval_list_items',uid).find(r=>String(r.record_id)===String(recordId)&&!r.removed_at);if(x)updateById_('approval_list_items',x.id,{removed_at:nowIso_(),removed_reason:reason});}
function updateApprovalItemNumber_(uid,recordId,tarih,yil,sayi){const x=ownRows_('approval_list_items',uid).find(r=>String(r.record_id)===String(recordId)&&!r.removed_at);if(x)updateById_('approval_list_items',x.id,{tarih,yil,sayi});}
function nextNumber_(uid,belge){const lock=LockService.getScriptLock();lock.waitLock(30000);try{const yil=new Date().getFullYear();let x=rows_('counters').find(r=>String(r.user_id)===String(uid)&&r.belge_turu===belge&&Number(r.yil)===yil);let n=1;if(!x){append_('counters',{user_id:uid,belge_turu:belge,yil,last_number:1});}else{n=Number(x.last_number||0)+1;const sh=table_('counters'),v=sh.getDataRange().getValues(),h=v[0].map(String),u=h.indexOf('user_id'),b=h.indexOf('belge_turu'),y=h.indexOf('yil'),l=h.indexOf('last_number');for(let i=1;i<v.length;i++){if(String(v[i][u])===String(uid)&&v[i][b]===belge&&Number(v[i][y])===yil){sh.getRange(i+1,l+1).setValue(n);break;}}}return{yil,sayi:n};}finally{lock.releaseLock();}}
function audit_(uid,action,rid,details){append_('audit_log',{id:uuid_(),user_id:uid,action,record_id:rid||'',details:details||'',created_at:nowIso_()});}
function seedConfig_(uid){const d={kurum_adi:'Kamu Kurumu',ust_kurum:'',default_gorev_yeri:'',basari_taltif_metni:'',ustun_basari_taltif_metni:'',aktif_sablon_basari:'dikey_1',aktif_sablon_ustun_basari:'dikey_1'};const c=getConfigObject_(uid);Object.keys(d).forEach(k=>{if(!(k in c))setConfig_(uid,k,d[k]);});}
function getConfigObject_(uid){const o={};rows_('config').filter(r=>String(r.user_id)===String(uid)).forEach(r=>o[r.key]=r.value);return o;}
function setConfig_(uid,key,value){const sh=table_('config'),v=sh.getDataRange().getValues(),h=v[0].map(String),u=h.indexOf('user_id'),k=h.indexOf('key'),val=h.indexOf('value'),up=h.indexOf('updated_at');for(let i=1;i<v.length;i++){if(String(v[i][u])===String(uid)&&String(v[i][k])===String(key)){sh.getRange(i+1,val+1).setValue(value);sh.getRange(i+1,up+1).setValue(nowIso_());return;}}sh.appendRow(h.map(x=>x==='user_id'?uid:x==='key'?key:x==='value'?value:x==='updated_at'?nowIso_():''));}
function rootFolder_(){const p=PropertiesService.getScriptProperties();let id=p.getProperty('ROOT_FOLDER_ID'),f;try{if(id)f=DriveApp.getFolderById(id);}catch(e){}if(!f){f=DriveApp.createFolder(APP_NAME+' - Kullanıcı Verileri');p.setProperty('ROOT_FOLDER_ID',f.getId());}return f;}
function ensureUserFolders_(uid,email){const root=rootFolder_(),name='user_'+uid,it=root.getFoldersByName(name),f=it.hasNext()?it.next():root.createFolder(name);f.setDescription('Üye: '+email);return{root:f,photos:childFolder_(f,'Fotograflar'),signatures:childFolder_(f,'Imzalar'),documents:childFolder_(f,'Belgeler'),backups:childFolder_(f,'Yedekler')};}
function childFolder_(p,n){const it=p.getFoldersByName(n);return it.hasNext()?it.next():p.createFolder(n);}
function makePassword_(p){const s=uuid_().replace(/-/g,'');return s+':'+sha_(p+'|'+s);} function checkPassword_(p,v){const a=v.split(':');return a.length===2&&sha_(p+'|'+a[0])===a[1];} function sha_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(b=>(b<0?b+256:b).toString(16).padStart(2,'0')).join('');}
function safeUser_(u){return{id:String(u.id),email:clean_(u.email),full_name:clean_(u.full_name),role:clean_(u.role),plan:clean_(u.plan),active:truthy_(u.active),trial_ends_at:jsonValue_(u.trial_ends_at),record_limit:Number(u.record_limit||0),records_created:Number(u.records_created||0)};}
function jsonSafe_(o){const x={};Object.keys(o||{}).forEach(k=>x[k]=jsonValue_(o[k]));return x;} function jsonValue_(v){return Object.prototype.toString.call(v)==='[object Date]'?v.toISOString():v;}
function clean_(v){return String(v==null?'':v).trim();} function cleanTc_(v){return clean_(v).replace(/\D/g,'');} function validEmail_(e){return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);} function truthy_(v){return v===true||v===1||String(v).toLowerCase()==='true';} function uuid_(){return Utilities.getUuid();} function nowIso_(){return new Date().toISOString();} function uniq_(a){return [...new Set((a||[]).map(String).filter(Boolean))];} function ok_(m){return{ok:true,message:m};} function fail_(m){return{ok:false,message:m};} function yearOf_(v){const d=new Date(v);return isNaN(d)?0:d.getFullYear();} function withinDays_(iso,d){const t=Date.parse(iso);return !!t&&(Date.now()-t)<=d*86400000;} function formatDateTR_(d){return Utilities.formatDate(d,'Europe/Istanbul','dd.MM.yyyy');} function recordNo_(r){return r.yil&&r.sayi?`${r.yil}/${String(r.sayi).padStart(3,'0')}`:'';} function fingerprint_(...p){return sha_(p.join('|').toLocaleLowerCase('tr-TR'));}


/* ===== FirstRunService.gs ===== */
/*
 * FirstRunService.gs
 * İlk kurulumda kullanıcıya kod ekletmeden ilk yönetici hesabını oluşturur.
 */

function getFirstRunState() {
  ensureSystem_();
  const admins = rows_('users').filter(r => String(r.role || '').toUpperCase() === 'ADMIN' && truthy_(r.active));
  return {ok:true, configured:admins.length > 0};
}

function createFirstAdmin(fullName, email, password) {
  ensureSystem_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existingAdmin = rows_('users').find(r => String(r.role || '').toUpperCase() === 'ADMIN' && truthy_(r.active));
    if (existingAdmin) return fail_('İlk kurulum daha önce tamamlanmış.');

    fullName = clean_(fullName);
    email = clean_(email).toLowerCase();
    password = String(password || '');
    if (fullName.length < 3) return fail_('Ad Soyad girin.');
    if (!validEmail_(email)) return fail_('Geçerli e-posta girin.');
    if (password.length < 8) return fail_('Parola en az 8 karakter olmalıdır.');

    let user = findOne_('users', r => clean_(r.email).toLowerCase() === email);
    if (!user) {
      const id = uuid_();
      append_('users', {
        id:id,
        email:email,
        full_name:fullName,
        password_hash:makePassword_(password),
        role:'ADMIN',
        plan:'FULL',
        active:true,
        created_at:nowIso_(),
        trial_ends_at:'',
        record_limit:0,
        records_created:0
      });
      ensureUserFolders_(id,email);
      seedConfig_(id);
      audit_(id,'FIRST_ADMIN_CREATED','',email);
      user = findOne_('users', r => String(r.id) === String(id));
    } else {
      updateById_('users', user.id, {
        full_name:fullName,
        password_hash:makePassword_(password),
        role:'ADMIN',
        plan:'FULL',
        active:true,
        trial_ends_at:'',
        record_limit:0
      });
      ensureUserFolders_(user.id,email);
      seedConfig_(user.id);
      audit_(user.id,'FIRST_ADMIN_PROMOTED','',email);
      user = findOne_('users', r => String(r.id) === String(user.id));
    }

    const token = uuid_() + uuid_();
    append_('sessions', {
      token:token,
      user_id:user.id,
      created_at:nowIso_(),
      expires_at:new Date(Date.now()+SESSION_HOURS*3600000).toISOString()
    });
    return {ok:true, token:token, user:safeUser_(user), message:'İlk yönetici hesabı oluşturuldu.'};
  } finally {
    lock.releaseLock();
  }
}


/* ===== RecordService.gs ===== */
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


/* ===== ExcelService.gs ===== */
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


/* ===== BulkService.gs ===== */
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


/* ===== SettingsService.gs ===== */
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


/* ===== PdfService.gs ===== */
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


/* ===== PdfGuardService.gs ===== */
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


/* ===== BackupService.gs ===== */
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


/* ===== BulkExportService.gs ===== */
/*
 * BulkExportService.gs
 * Masaustu Toplu PDF Indirme ve Toplu Yedekleme islemleri.
 */

function createStoredPdfZipWeb(token, recordIds) {
  const u=requireUser_(token);
  const blobs=[];
  const missing=[];
  uniq_(recordIds||[]).forEach(id=>{
    const r=ownById_('records',u.id,id);
    if(!r||!clean_(r.pdf_file_id)){missing.push(String(id));return;}
    try{
      const f=DriveApp.getFileById(r.pdf_file_id);
      blobs.push(f.getBlob().setName(f.getName()));
    }catch(e){missing.push(String(id));}
  });
  if(!blobs.length)return fail_('Seçilen kayıtlarda indirilebilir PDF bulunamadı.');
  const name='toplu_pdf_'+Utilities.formatDate(new Date(),'Europe/Istanbul','yyyyMMdd_HHmmss')+'.zip';
  const zip=Utilities.zip(blobs,name);
  audit_(u.id,'BULK_PDF_ZIP','',JSON.stringify({count:blobs.length,missing:missing.length}));
  return {ok:true,name:name,base64:Utilities.base64Encode(zip.getBytes()),count:blobs.length,missing:missing};
}

function createSelectedBackupWeb(token, recordIds) {
  const u=requireUser_(token);
  const ids=uniq_(recordIds||[]);
  if(!ids.length)return fail_('Yedeklenecek kayıt seçilmedi.');
  const idSet={};ids.forEach(x=>idSet[String(x)]=true);
  const records=ownRows_('records',u.id).filter(r=>idSet[String(r.id)]);
  if(!records.length)return fail_('Uygun kayıt bulunamadı.');

  const approvalIds={};records.forEach(r=>{if(clean_(r.approval_list_id))approvalIds[String(r.approval_list_id)]=true;});
  const superiorIds={};records.forEach(r=>superiorIds[String(r.id)]=true);
  const data={
    format:'MIA_BASARI_SELECTED_BACKUP_V1',
    exported_at:nowIso_(),
    records:records.map(jsonSafe_),
    approval_lists:ownRows_('approval_lists',u.id).filter(x=>approvalIds[String(x.id)]).map(jsonSafe_),
    approval_list_items:ownRows_('approval_list_items',u.id).filter(x=>idSet[String(x.record_id)]).map(jsonSafe_),
    superior_basis:ownRows_('superior_basis',u.id).filter(x=>superiorIds[String(x.superior_record_id)]||idSet[String(x.source_id)]).map(jsonSafe_)
  };

  const blobs=[Utilities.newBlob(JSON.stringify(data,null,2),'application/json','secili_kayitlar.json')];
  const added={};
  records.forEach(r=>{
    addDrivePathBlobToBackupWeb_(blobs,added,r.foto_path,'Fotograflar');
    addDrivePathBlobToBackupWeb_(blobs,added,r.signature_path,'Imzalar');
    if(clean_(r.pdf_file_id)){
      try{
        const f=DriveApp.getFileById(r.pdf_file_id),key='pdf:'+f.getId();
        if(!added[key]){blobs.push(f.getBlob().setName('Belgeler/'+f.getName()));added[key]=true;}
      }catch(e){}
    }
  });
  const name='secili_belgeler_yedek_'+Utilities.formatDate(new Date(),'Europe/Istanbul','yyyyMMdd_HHmmss')+'.zip';
  const zip=Utilities.zip(blobs,name);
  audit_(u.id,'SELECTED_BACKUP','',JSON.stringify({count:records.length}));
  return {ok:true,name:name,base64:Utilities.base64Encode(zip.getBytes()),count:records.length};
}

function addDrivePathBlobToBackupWeb_(blobs,added,path,prefix){
  path=clean_(path);if(path.indexOf('drive:')!==0)return;
  const id=path.substring(6),key=prefix+':'+id;if(added[key])return;
  try{const f=DriveApp.getFileById(id);blobs.push(f.getBlob().setName(prefix+'/'+f.getName()));added[key]=true;}catch(e){}
}


/* ===== ParityService.gs ===== */
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
