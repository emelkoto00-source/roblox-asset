import { NextResponse } from 'next/server';
import { db,enqueueUpload,getBatch } from '@est/core';
import { guard,failure } from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
  const deny=await guard(request,true);if(deny)return deny;
  try{
    if(process.env.ROBLOX_UPLOADS_ENABLED!=='true')throw new Error('Publishing disabled; verify Roblox Open Cloud first');
    const {id}=await ctx.params;
    const batch=await getBatch(id);if(!batch)return NextResponse.json({error:'Batch not found'},{status:404});
    if(batch.status!=='staged')throw new Error('Wait until the current operation finishes');
    const client=await db().connect();let assetId:string|undefined;
    try{
      await client.query('BEGIN');
      const {rows}=await client.query(`UPDATE assets SET status='queued' WHERE id=(SELECT id FROM assets WHERE batch_id=$1 AND status='staged' ORDER BY rel_path LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id`,[id]);
      assetId=rows[0]?.id;
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    if(!assetId)throw new Error('No remaining staged assets');
    await enqueueUpload(assetId);
    return NextResponse.json({testQueued:true,assetId});
  }catch(e){return failure(e)}
}
