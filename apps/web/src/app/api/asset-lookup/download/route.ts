import { db,loadPNG } from '@est/core';
import { NextResponse } from 'next/server';
import {guard} from '@/lib/http';
import {validateAssetId,validateOwner,safeFilename} from '@/lib/assetLookup';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const deny=await guard(request);if(deny)return deny;
  const url=new URL(request.url);
  let id:string,owner:string;
  try{
    id=validateAssetId(String(url.searchParams.get('id')||'').trim());
    owner=validateOwner(String(url.searchParams.get('owner')||'user'));
  }catch(e){return NextResponse.json({error:(e as Error).message},{status:400})}
  const {rows}=await db().query(
    "SELECT a.storage_key,a.effect,a.kind,a.status FROM assets a JOIN batches b ON b.id=a.batch_id "+
    "WHERE a.asset_id=$1 AND a.status='created' AND b.owner_type=$2 "+
    "ORDER BY a.created_at DESC LIMIT 1",[id,owner]);
  if(!rows.length)return NextResponse.json({error:'No downloadable file stored by EST for this asset and owner.'},{status:404});
  try{
    const buffer=await loadPNG(rows[0].storage_key);
    if(buffer.length>30_000_000)throw Error('Stored file exceeds download limit');
    const name=safeFilename(rows[0].effect)+'_'+id+'.png';
    return new Response(new Uint8Array(buffer),{
      headers:{
        'Content-Type':'image/png',
        'Content-Disposition':'attachment; filename="'+name+'"',
        'Content-Length':String(buffer.length),
        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'
      }
    });
  }catch{
    return NextResponse.json({error:'Stored file was not available for download.'},{status:503});
  }
}
