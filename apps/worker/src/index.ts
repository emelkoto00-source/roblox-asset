import { Worker } from 'bullmq';
import { db, enqueuePoll, loadPNG, parseCreatedId, parseOperationRef, publishImage, checkOperation, redisConnection, RobloxHttpError } from '@est/core';

if(process.env.ROBLOX_UPLOADS_ENABLED!=='true') console.warn('Uploads disabled. Set ROBLOX_UPLOADS_ENABLED=true only after verifying Roblox Open Cloud configuration.');

async function refreshBatch(batchId:string){
  const {rows}=await db().query(`SELECT status,count(*)::int AS count FROM assets WHERE batch_id=$1 GROUP BY status`,[batchId]);
  const groups=Object.fromEntries(rows.map((r:any)=>[r.status,r.count]));
  const active=(groups.queued||0)+(groups.submitting||0)+(groups.processing||0);
  const total=Object.values(groups).reduce((sum:number,n:any)=>sum+Number(n),0);
  const done=(groups.created||0)+(groups.failed||0)+(groups.needs_review||0);
  const next=done===total?'finished':active>0?'running':'staged';
  await db().query('UPDATE batches SET status=$1 WHERE id=$2',[next,batchId]);
}
async function upload(id:string){
  if(process.env.ROBLOX_UPLOADS_ENABLED!=='true') return;
  const {rows}=await db().query(`UPDATE assets SET status='submitting',error_text=NULL WHERE id=$1 AND status='queued' RETURNING *`,[id]);
  const asset=rows[0]; if(!asset) return;
  const {rows:batchRows}=await db().query(`SELECT owner_type FROM batches WHERE id=$1`,[asset.batch_id]);
  const owner=batchRows[0]?.owner_type;
  if(owner!=='user'&&owner!=='group') throw new Error('Bad batch creator');
  try{
    const png=await loadPNG(asset.storage_key);
    // Only image bytes and a safe display name are sent to Roblox. Never include our secrets in metadata.
    const manual=asset.kind==='manual_image'||asset.kind==='authorized_image_migration';
    const name=manual?String(asset.effect).slice(0,50):`EST_${asset.effect.replace(/\W+/g,'_')}_${asset.rel_path.split('/').pop()!.replace(/\.png$/i,'')}`.slice(0,50);
    const result=await publishImage(png,name,owner,manual?'Uploaded with EST Roblox Asset Cloud':undefined);
    const op=parseOperationRef(result),created=parseCreatedId(result);
    if(created){await db().query(`UPDATE assets SET status='created',asset_id=$1 WHERE id=$2`,[created,id]);}
    else if(op){await db().query(`UPDATE assets SET status='processing',operation_ref=$1 WHERE id=$2`,[op,id]);await enqueuePoll(id);}
    else {await db().query(`UPDATE assets SET status='needs_review',error_text=$1 WHERE id=$2`,['Roblox returned an unrecognized create response; inspect manually before retry',id]);}
  } catch(e){
    // A transport error after POST may mean the asset WAS created: no blind retry.
    const text=String(e instanceof Error?e.message:e).slice(0,700);
    const knownRejected=e instanceof RobloxHttpError && e.code>=400&&e.code<500;
    await db().query(`UPDATE assets SET status=$1,error_text=$2 WHERE id=$3`,[knownRejected?'failed':'needs_review',text,id]);
  }
  await refreshBatch(asset.batch_id);
}
async function poll(id:string){
  const {rows}=await db().query('SELECT a.*,b.owner_type FROM assets a JOIN batches b ON b.id=a.batch_id WHERE a.id=$1',[id]);
  const asset=rows[0];if(!asset||asset.status!=='processing'||!asset.operation_ref)return;
  try {
    const result=await checkOperation(asset.operation_ref,asset.owner_type);
    if(!result.done){await enqueuePoll(id,15000);return;}
    if(result.error){await db().query(`UPDATE assets SET status='failed',error_text=$1 WHERE id=$2`,[JSON.stringify(result.error).slice(0,700),id]);}
    else {
      const created=parseCreatedId(result);
      if (created) await db().query(`UPDATE assets SET status='created',asset_id=$1 WHERE id=$2`,[created,id]);
      else await db().query(`UPDATE assets SET status='needs_review',error_text=$1 WHERE id=$2`,['Operation completed but asset ID not found; inspect response before retry',id]);
    }
    await refreshBatch(asset.batch_id);
  } catch (e){
    console.error('Polling error (safe to retry GET):', String(e));
    await enqueuePoll(id,30000);
  }
}
const worker=new Worker('est-asset-publisher',async job=> {
  if(job.name==='upload') await upload(String(job.data.assetId));
  if(job.name==='poll') await poll(String(job.data.assetId));
},{connection:redisConnection(),concurrency:2,limiter:{max:Number(process.env.ROBLOX_UPLOADS_PER_SECOND||2),duration:1000}});
worker.on('failed',(job,err)=>console.error(`Job ${job?.name} failed:`,err.message));
console.log('EST upload worker online (publisher + operation status polling)');
process.on('SIGTERM',async()=>{await worker.close();await db().end();process.exit(0)});
