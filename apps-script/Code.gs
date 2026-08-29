const APP_NAME = 'Kamu Kurumları Başarı Belgeleri';
const DEFAULT_TRIAL_DAYS = 7;
const DEFAULT_TRIAL_LIMIT = 10;
const SESSION_HOURS = 24 * 7;

function doGet() {
  ensureSystem_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function setupSystem(adminEmail) {
  const props = PropertiesService.getScriptProperties();
  const email = String(adminEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Geçerli yönetici e-postası girin.');
  props.setProperty('ADMIN_EMAIL', email);
  ensureSystem_();
  const ss = getDb_();
  const users = ss.getSheetByName('USERS');
  const values = users.getDataRange().getValues();
  const idx = values.findIndex((r,i)=>i>0 && String(r[1]).toLowerCase()===email);
  if (idx < 0) {
    const id = Utilities.getUuid();
    users.appendRow([id,email,'Sistem Yöneticisi','ADMIN','FULL',true,new Date(),'','',0,'']);
  } else {
    users.getRange(idx+1,4,1,3).setValues([['ADMIN','FULL',true]]);
  }
  return {ok:true, message:'Sistem hazır. Yönetici: '+email, spreadsheetId:ss.getId(), rootFolderId:getRootFolder_().getId()};
}

function registerUser(name,email,password) {
  ensureSystem_();
  name = String(name||'').trim(); email = String(email||'').trim().toLowerCase(); password = String(password||'');
  if (name.length < 3) return fail_('Ad Soyad girin.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail_('Geçerli e-posta girin.');
  if (password.length < 8) return fail_('Parola en az 8 karakter olmalıdır.');
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sh=getDb_().getSheetByName('USERS');
    const rows=sheetObjects_(sh);
    if (rows.some(r=>String(r.email).toLowerCase()===email)) return fail_('Bu e-posta zaten kayıtlı.');
    const id=Utilities.getUuid();
    const salt=Utilities.getUuid().replace(/-/g,'');
    const hash=hashPassword_(password,salt);
    const ends=new Date(Date.now()+DEFAULT_TRIAL_DAYS*86400000);
    sh.appendRow([id,email,name,'USER','TRIAL',true,new Date(),ends,DEFAULT_TRIAL_LIMIT,0,salt+':'+hash]);
    ensureUserFolder_(id,email);
    return {ok:true,message:'Üyelik oluşturuldu. Deneme hesabınız hazır.'};
  } finally { lock.releaseLock(); }
}

function loginUser(email,password) {
  ensureSystem_();
  email=String(email||'').trim().toLowerCase(); password=String(password||'');
  const sh=getDb_().getSheetByName('USERS');
  const rows=sheetObjects_(sh);
  const u=rows.find(r=>String(r.email).toLowerCase()===email);
  if (!u || !verifyPassword_(password,String(u.password_hash||''))) return fail_('E-posta veya parola hatalı.');
  if (!truthy_(u.active) || String(u.plan)==='BLOCKED') return fail_('Bu üyelik kullanıma kapatılmıştır.');
  if (String(u.plan)==='TRIAL' && new Date(u.trial_ends_at).getTime()<Date.now()) return fail_('Deneme süreniz sona ermiştir.');
  const token=Utilities.getUuid()+Utilities.getUuid();
  const exp=new Date(Date.now()+SESSION_HOURS*3600000);
  getDb_().getSheetByName('SESSIONS').appendRow([token,u.id,new Date(),exp]);
  return {ok:true,token,user:safeUser_(u)};
}

function logoutUser(token) {
  const sh=getDb_().getSheetByName('SESSIONS');
  deleteRowsBy_(sh,'token',String(token||''));
  return {ok:true};
}

function getSession(token) {
  const u=sessionUser_(token); return u ? {ok:true,user:safeUser_(u)} : fail_('Oturum bulunamadı.');
}

function createRecord(token,data) {
  const u=requireUser_(token);
  enforceTrial_(u);
  data=data||{};
  const recId=Utilities.getUuid();
  const now=new Date();
  const sh=getDb_().getSheetByName('RECORDS');
  sh.appendRow([
    recId,u.id,String(data.tc||''),String(data.ad_soyad||''),String(data.unvan||''),String(data.gorev_yeri||''),
    String(data.belge_turu||'BASARI'),String(data.gerekce||''),String(data.tarih||''),String(data.sayi||''),'TASLAK',now,now
  ]);
  incrementUsage_(u.id);
  return {ok:true,id:recId,message:'Kayıt oluşturuldu.'};
}

function listRecords(token) {
  const u=requireUser_(token);
  const rows=sheetObjects_(getDb_().getSheetByName('RECORDS')).filter(r=>String(r.user_id)===String(u.id));
  rows.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  return {ok:true,records:rows};
}

function updateRecordStatus(token,recordId,status) {
  const u=requireUser_(token);
  const allowed=['TASLAK','OLUR_LISTESINDE','TESLIM_EDILDI','IPTAL'];
  status=String(status||''); if(!allowed.includes(status)) throw new Error('Geçersiz durum.');
  const sh=getDb_().getSheetByName('RECORDS'); const vals=sh.getDataRange().getValues(); const hdr=vals[0];
  const idCol=hdr.indexOf('id'), userCol=hdr.indexOf('user_id'), statusCol=hdr.indexOf('status'), updCol=hdr.indexOf('updated_at');
  for(let i=1;i<vals.length;i++) if(String(vals[i][idCol])===String(recordId) && String(vals[i][userCol])===String(u.id)) {
    sh.getRange(i+1,statusCol+1).setValue(status); sh.getRange(i+1,updCol+1).setValue(new Date()); return {ok:true};
  }
  throw new Error('Kayıt bulunamadı.');
}

function getAdminUsers(token) {
  const u=requireUser_(token); if(String(u.role)!=='ADMIN') throw new Error('Yetkisiz işlem.');
  return {ok:true,users:sheetObjects_(getDb_().getSheetByName('USERS')).map(safeUser_)};
}

function adminUpdateUser(token,userId,plan,days,limit,active) {
  const admin=requireUser_(token); if(String(admin.role)!=='ADMIN') throw new Error('Yetkisiz işlem.');
  const plans=['TRIAL','FULL','BLOCKED']; if(!plans.includes(plan)) throw new Error('Geçersiz üyelik.');
  const sh=getDb_().getSheetByName('USERS'); const vals=sh.getDataRange().getValues(); const hdr=vals[0];
  const idc=hdr.indexOf('id');
  for(let i=1;i<vals.length;i++) if(String(vals[i][idc])===String(userId)) {
    const obj={}; hdr.forEach((h,j)=>obj[h]=vals[i][j]); if(String(obj.role)==='ADMIN') throw new Error('Yönetici hesabı değiştirilemez.');
    const end=plan==='TRIAL'?new Date(Date.now()+Number(days||DEFAULT_TRIAL_DAYS)*86400000):'';
    sh.getRange(i+1,hdr.indexOf('plan')+1).setValue(plan);
    sh.getRange(i+1,hdr.indexOf('active')+1).setValue(plan==='BLOCKED'?false:Boolean(active));
    sh.getRange(i+1,hdr.indexOf('trial_ends_at')+1).setValue(end);
    sh.getRange(i+1,hdr.indexOf('record_limit')+1).setValue(Number(limit||DEFAULT_TRIAL_LIMIT));
    return {ok:true};
  }
  throw new Error('Üye bulunamadı.');
}

function getDriveInfo(token) {
  const u=requireUser_(token); const f=ensureUserFolder_(u.id,u.email); return {ok:true,folderId:f.getId(),folderName:f.getName()};
}

function ensureSystem_() {
  getDb_(); getRootFolder_();
}

function getDb_() {
  const p=PropertiesService.getScriptProperties(); let id=p.getProperty('DB_ID'); let ss;
  if(id){ try{ss=SpreadsheetApp.openById(id);}catch(e){} }
  if(!ss){ ss=SpreadsheetApp.create('Kamu Başarı Belgeleri - Sistem Veritabanı'); p.setProperty('DB_ID',ss.getId()); }
  ensureSheet_(ss,'USERS',['id','email','full_name','role','plan','active','created_at','trial_ends_at','record_limit','records_created','password_hash']);
  ensureSheet_(ss,'SESSIONS',['token','user_id','created_at','expires_at']);
  ensureSheet_(ss,'RECORDS',['id','user_id','tc','ad_soyad','unvan','gorev_yeri','belge_turu','gerekce','tarih','sayi','status','created_at','updated_at']);
  return ss;
}

function getRootFolder_(){ const p=PropertiesService.getScriptProperties(); let id=p.getProperty('ROOT_FOLDER_ID'); let f; if(id){try{f=DriveApp.getFolderById(id);}catch(e){}} if(!f){f=DriveApp.createFolder('Kamu Başarı Belgeleri - Kullanıcı Verileri');p.setProperty('ROOT_FOLDER_ID',f.getId());} return f; }
function ensureUserFolder_(id,email){ const root=getRootFolder_(); const name='user_'+id; const it=root.getFoldersByName(name); const f=it.hasNext()?it.next():root.createFolder(name); const desc='Üye: '+email; if(f.getDescription()!==desc)f.setDescription(desc); ['Fotograflar','Imzalar','Belgeler','Yedekler'].forEach(n=>{const x=f.getFoldersByName(n); if(!x.hasNext())f.createFolder(n);}); return f; }
function ensureSheet_(ss,name,headers){ let sh=ss.getSheetByName(name); if(!sh)sh=ss.insertSheet(name); if(sh.getLastRow()===0)sh.appendRow(headers); else {const got=sh.getRange(1,1,1,headers.length).getValues()[0]; headers.forEach((h,i)=>{if(got[i]!==h)sh.getRange(1,i+1).setValue(h);});} return sh; }
function sheetObjects_(sh){ const vals=sh.getDataRange().getValues(); if(vals.length<2)return[]; const h=vals[0].map(String); return vals.slice(1).filter(r=>r.some(v=>v!==''&&v!==null)).map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]);return o;}); }
function hashPassword_(pw,salt){ const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,pw+'|'+salt,Utilities.Charset.UTF_8); return bytes.map(b=>(b<0?b+256:b).toString(16).padStart(2,'0')).join(''); }
function verifyPassword_(pw,stored){ const p=stored.split(':'); return p.length===2 && hashPassword_(pw,p[0])===p[1]; }
function sessionUser_(token){ token=String(token||''); if(!token)return null; const ss=getDb_(); const sess=sheetObjects_(ss.getSheetByName('SESSIONS')).find(s=>String(s.token)===token && new Date(s.expires_at).getTime()>Date.now()); if(!sess)return null; return sheetObjects_(ss.getSheetByName('USERS')).find(u=>String(u.id)===String(sess.user_id))||null; }
function requireUser_(token){ const u=sessionUser_(token); if(!u)throw new Error('Oturum süresi dolmuş. Yeniden giriş yapın.'); if(!truthy_(u.active)||String(u.plan)==='BLOCKED')throw new Error('Üyelik kapalı.'); return u; }
function enforceTrial_(u){ if(String(u.plan)==='FULL')return; if(String(u.plan)!=='TRIAL')throw new Error('Yeni kayıt yetkiniz yok.'); if(new Date(u.trial_ends_at).getTime()<Date.now())throw new Error('Deneme süreniz doldu.'); if(Number(u.records_created||0)>=Number(u.record_limit||0))throw new Error('Deneme kayıt limitiniz doldu.'); }
function incrementUsage_(uid){ const sh=getDb_().getSheetByName('USERS'); const vals=sh.getDataRange().getValues(), h=vals[0], ic=h.indexOf('id'), cc=h.indexOf('records_created'); for(let i=1;i<vals.length;i++)if(String(vals[i][ic])===String(uid)){sh.getRange(i+1,cc+1).setValue(Number(vals[i][cc]||0)+1);break;} }
function safeUser_(u){ return {id:String(u.id),email:String(u.email),full_name:String(u.full_name),role:String(u.role),plan:String(u.plan),active:truthy_(u.active),created_at:u.created_at,trial_ends_at:u.trial_ends_at,record_limit:Number(u.record_limit||0),records_created:Number(u.records_created||0)}; }
function truthy_(v){ return v===true || String(v).toLowerCase()==='true' || Number(v)===1; }
function deleteRowsBy_(sh,col,val){ const d=sh.getDataRange().getValues(); if(!d.length)return; const idx=d[0].indexOf(col); for(let i=d.length-1;i>=1;i--)if(String(d[i][idx])===val)sh.deleteRow(i+1); }
function fail_(m){ return {ok:false,message:m}; }
