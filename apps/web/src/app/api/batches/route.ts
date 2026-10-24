import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { db, scanESTZip, savePNG, checkedMaxZipBytes, VALID_MODES } from '@est/core';
import { guard, failure } from '@/lib/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const deny=await guard(request);if(deny)return deny;
  const {rows}=await db().query(`SELECT b.*, (SELECT COUNT(*)::int FROM assets a WHERE a.batch_id=b.id) AS count,
  (SELECT COUNT(*)::int FROM assets a WHERE a.batch_id=b.id AND a.status='created') AS created,
  (SELECT CASE
    WHEN EXISTS (SELECT 1 FROM assets a WHERE a.batch_id=b.id AND a.rel_path LIKE 'Identity_Artifacts/%') THEN 'artifacts_v1'
    WHEN EXISTS (SELECT 1 FROM assets a WHERE a.batch_id=b.id AND a.rel_path LIKE 'Cinematic_Reveals/%') THEN 'signature_v1'
    WHEN EXISTS (SELECT 1 FROM assets a WHERE a.batch_id=b.id AND a.rel_path LIKE 'Name_Accents/%') THEN 'creative_v3'
    ELSE 'particle_v4' END) AS pack_type
  FROM batches b ORDER BY b.created_at DESC LIMIT 20`);
  return NextResponse.json({batches:rows});
}
export async function POST(request:Request){
  const deny=await guard(request,true);if(deny)return deny;
  try{
    const form=await request.formData();
    const file=form.get('file');
    const mode=String(form.get('mode')||'essential');
    const owner=String(form.get('owner')||'user');
    if(!VALID_MODES.includes(mode as any))throw new Error('Invalid selection mode');
    if(owner!=='user' && owner!=='group')throw new Error('Invalid owner');
    if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.zip'))throw new Error('Please select an EST asset collection ZIP');
    if(file.size>checkedMaxZipBytes())throw new Error('ZIP exceeds upload size limit');
    const buffer=Buffer.from(await file.arrayBuffer());
    const scan=await scanESTZip(buffer,mode as any);
    const batchId=randomUUID();
    const ownerId=owner==='user'?process.env.ALLOWED_ROBLOX_USER_ID:process.env.ALLOWED_ROBLOX_GROUP_ID;
    if(!ownerId || !/^\d+$/.test(ownerId))throw new Error('Set the allowed Roblox owner ID on Railway');
    // Stage files before inserting the batch. Orphaned S3 objects are safe, and can be garbage-collected.
    const stored: {id:string,effect:string,kind:string,path:string,key:string,hash:string}[]=[];
    for(let i=0;i<scan.assets.length;i+=6){
      await Promise.all(scan.assets.slice(i,i+6).map(async a=>{
        const key=`batches/${batchId}/${createHash('sha256').update(a.path).digest('hex')}.png`;
        await savePNG(key,a.data);
        stored.push({id:randomUUID(),effect:a.effect,kind:a.kind,path:a.path,key,hash:a.sha256});
      }));
    }
    const client=await db().connect();
    try{
      await client.query('BEGIN');
      await client.query(`INSERT INTO batches(id,filename,owner_type,owner_id,mode,status) VALUES($1,$2,$3,$4,$5,'staged')`,[batchId,file.name,owner,ownerId,mode]);
      for(const a of stored)await client.query(`INSERT INTO assets(id,batch_id,effect,kind,rel_path,storage_key,sha256,status) VALUES($1,$2,$3,$4,$5,$6,$7,'staged')`,[a.id,batchId,a.effect,a.kind,a.path,a.key,a.hash]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    return NextResponse.json({id:batchId,owner,ownerId,mode,packType:scan.packType,count:stored.length,summary:scan.counts,readyToStart:true},{status:201});
  }catch(e){return failure(e)}
}
