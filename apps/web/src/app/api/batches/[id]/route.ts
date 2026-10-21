import { NextResponse } from 'next/server';
import { getBatch,getAssets } from '@est/core';
import { guard } from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){
  const deny=await guard(request);if(deny)return deny;
  const {id}=await ctx.params;
  const batch=await getBatch(id);if(!batch)return NextResponse.json({error:'Not found'},{status:404});
  const assets=await getAssets(id);
  const counts=assets.reduce((out:Record<string,number>,a)=>{out[a.status]=(out[a.status]||0)+1;return out},{})
  return NextResponse.json({batch,counts,total:assets.length,assets:assets.map(({storage_key,sha256,...safe})=>safe)});
}
