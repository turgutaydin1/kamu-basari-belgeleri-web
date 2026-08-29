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
