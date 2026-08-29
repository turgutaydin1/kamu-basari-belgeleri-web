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
