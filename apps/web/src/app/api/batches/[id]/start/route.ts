import { NextResponse } from 'next/server';
import { db,enqueueUpload,getBatch } from '@est/core';
import { guard,failure } from '@/lib/http';
export const runtime='nodejs';
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
  const deny=await guard(request,true);if(deny)return deny;
  try {
    if(process.env.ROBLOX_UPLOADS_ENABLED!=='true')throw new Error('Roblox publishing is disabled. Verify current API access and enable the service in Railway.');
    const {id}=await ctx.params;
    const batch=await getBatch(id);if(!batch)return NextResponse.json({error:'Batch not found'},{status:404});
    if(batch.status!=='staged')throw new Error('Batch was already started');
    await db().query(`UPDATE batches SET status='running' WHERE id=$1`,[id]);
    const {rows}=await db().query(`UPDATE assets SET status='queued' WHERE batch_id=$1 AND status='staged' RETURNING id`,[id]);
    for(const row of rows) await enqueueUpload(row.id);
    return NextResponse.json({started:true,count:rows.length});
  }catch(e){return failure(e)}
}
