import { NextResponse } from 'next/server';
import { createHash,randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db,savePNG } from '@est/core';
import { guard,failure } from '@/lib/http';
import { validateManualRequest,safeAssetName,ALLOWED_IMAGE_FORMATS,MAX_IMAGE_PIXELS,
  MAX_OUTPUT_IMAGE_BYTES,originalIdFromPath } from '@/lib/manualAssets';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request) {
  const deny=await guard(request);if(deny)return deny;
  try {
    const {rows}=await db().query(
      "SELECT a.id,a.batch_id,a.rel_path,a.status,a.asset_id,a.error_text,a.created_at, "+
      "b.owner_type,b.filename AS batch_name,b.status AS batch_status "+
      "FROM assets a JOIN batches b ON b.id=a.batch_id "+
      "WHERE a.rel_path LIKE 'Manual_Images/%' OR a.rel_path LIKE 'Authorized_Migrations/%' "+
      "ORDER BY a.created_at DESC,a.id DESC LIMIT 200");
    const assets=rows.map((r:any)=>({
      id:r.id,batchId:r.batch_id,name:r.rel_path.split('/').pop().replace(/\.png$/i,''),
      path:r.rel_path,sourceId:originalIdFromPath(r.rel_path),
      status:r.status,robloxId:r.asset_id,error:r.error_text,
      owner:r.owner_type,createdAt:r.created_at,batchStatus:r.batch_status,
    }));
    const batches=new Map<string,any>();
    for(const a of assets){
      if(!batches.has(a.batchId))batches.set(a.batchId,{id:a.batchId,count:0,
        created:0,pending:0,failed:0,owner:a.owner,workflow:a.sourceId?'migration':'upload',
        sourceId:a.sourceId,createdAt:a.createdAt});
      const b=batches.get(a.batchId);b.count++;
      if(a.status==='created')b.created++;
      else if(['failed','needs_review'].includes(a.status))b.failed++;
      else b.pending++;
    }
    return NextResponse.json({assets,batches:[...batches.values()]},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return failure(e);}
}

export async function POST(request:Request){
  const deny=await guard(request,true);if(deny)return deny;
  try{
    const form=await request.formData();
    const workflow=String(form.get('workflow')||'upload');
    const owner=String(form.get('owner')||'user');
    const sourceId=String(form.get('sourceId')||'').trim();
    const rights=String(form.get('rights')||'');
    const confirmed=form.get('confirmed')==='true';
    const files=form.getAll('files');
    if(files.some(f=>!(f instanceof File)))throw Error('Every selected item must be an image file');
    const images=files as File[];
    validateManualRequest({workflow,owner,sourceId,rights,confirmed,
      files:images.map(f=>({name:f.name,size:f.size}))});
    const ownerId=owner==='user'?process.env.ALLOWED_ROBLOX_USER_ID:process.env.ALLOWED_ROBLOX_GROUP_ID;
    if(!ownerId||!/^\d+$/.test(ownerId))throw Error('Roblox destination owner is not configured');

    // Decode and convert images server-side; never trust file extensions or MIME declarations.
    const prepared:{path:string;effect:string;data:Buffer;hash:string}[]=[];
    for(const [index,file] of images.entries()){
      const bytes=Buffer.from(await file.arrayBuffer());
      const decoder=sharp(bytes,{limitInputPixels:MAX_IMAGE_PIXELS,failOn:'error'});
      const meta=await decoder.metadata();
      if(!meta.format||!ALLOWED_IMAGE_FORMATS.has(meta.format)||
         !meta.width||!meta.height||meta.width*meta.height>MAX_IMAGE_PIXELS)
        throw Error('Unsupported or oversized image: '+file.name);
      const png=await decoder.rotate().resize(2048,2048,{fit:'inside',withoutEnlargement:true})
        .png({compressionLevel:9}).toBuffer();
      if(png.length>MAX_OUTPUT_IMAGE_BYTES)
        throw Error(file.name+' is too large as PNG. Try a smaller image');
      const name=safeAssetName(file.name);
      const unique=String(index+1).padStart(3,'0')+'_'+name+'.png';
      const path=workflow==='migration'
        ?'Authorized_Migrations/'+sourceId+'/'+unique
        :'Manual_Images/'+unique;
      prepared.push({path,effect:name,data:png,hash:createHash('sha256').update(png).digest('hex')});
    }
    const batchId=randomUUID();
    const stored:{id:string;path:string;effect:string;key:string;hash:string}[]=[];
    for(const a of prepared){
      const key='batches/'+batchId+'/'+createHash('sha256').update(a.path).digest('hex')+'.png';
      await savePNG(key,a.data);
      stored.push({id:randomUUID(),path:a.path,effect:a.effect,key,hash:a.hash});
    }
    const client=await db().connect();
    try{
      await client.query('BEGIN');
      const batchName=workflow==='migration'
        ?'Authorized migration from '+sourceId
        :'Manual image upload ('+stored.length+' images)';
      // The existing production mode=all constraint is preserved for historical batches.
      await client.query("INSERT INTO batches(id,filename,owner_type,owner_id,mode,status) "+
        "VALUES($1,$2,$3,$4,'all','staged')",[batchId,batchName,owner,ownerId]);
      for(const item of stored)await client.query(
        "INSERT INTO assets(id,batch_id,effect,kind,rel_path,storage_key,sha256,status) "+
        "VALUES($1,$2,$3,$4,$5,$6,$7,'staged')",
        [item.id,batchId,item.effect,workflow==='migration'?'authorized_image_migration':'manual_image',
         item.path,item.key,item.hash]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    return NextResponse.json({id:batchId,count:stored.length,owner,workflow,
      sourceId:workflow==='migration'?sourceId:null,status:'staged',
      message:'Staged for review. Nothing has been sent to Roblox yet.'},{status:201});
  }catch(e){return failure(e);}
}
