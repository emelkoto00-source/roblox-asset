import { NextResponse } from 'next/server';
import { db,creatorSettings } from '@est/core';
import { guard } from '@/lib/http';
import {validateAssetId,validateOwner,readRobloxMetadata} from '@/lib/assetLookup';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  const deny=await guard(request);if(deny)return deny;
  const url=new URL(request.url);
  let id:string,owner:'user'|'group';
  try{
    id=validateAssetId(String(url.searchParams.get('id')||'').trim());
    owner=validateOwner(String(url.searchParams.get('owner')||'user'));
  }catch(e){
    return NextResponse.json({error:(e as Error).message},{status:400});
  }

  try{
    // First-party copies are a reliable source: the app already has their bytes in S3.
    const {rows}=await db().query(
      "SELECT a.id,a.asset_id,a.kind,a.rel_path,a.effect,a.status,b.owner_id "+
      "FROM assets a JOIN batches b ON b.id=a.batch_id "+
      "WHERE a.asset_id=$1 AND b.owner_type=$2 AND a.status='created' "+
      "ORDER BY a.created_at DESC LIMIT 1",[id,owner]);
    if(rows.length){
      const asset=rows[0];
      const query=new URLSearchParams({id,owner});
      return NextResponse.json({
        id,source:'est-library',status:'available',name:asset.effect,
        assetType:'Image / Decal',creatorType:owner,creatorId:asset.owner_id,
        downloadable:true,mimeType:'image/png',extension:'png',
        downloadUrl:'/api/asset-lookup/download?'+query.toString(),
        explanation:'A stored PNG copy is available from your EST Asset Cloud uploads. For JPEG/WebP uploads, this is the converted PNG, not the original input bytes.',
      },{headers:{'Cache-Control':'private, no-store'}});
    }
  }catch(e){
    return NextResponse.json({error:'Unable to inspect your saved EST Asset Cloud files.'},{status:503});
  }

  // Metadata lookup only: do not use asset-delivery scraping, auth cookies or redirects
  // to bypass Roblox's creator permissions. Roblox asset:read authorization may be required.
  let settings:{ownerId:string;apiKey:string};
  try{settings=creatorSettings(owner)}catch{
    return NextResponse.json({error:'Roblox read credentials are not configured for that owner.'},{status:503});
  }
  try{
    const res=await fetch('https://apis.roblox.com/assets/v1/assets/'+encodeURIComponent(id),{
      method:'GET',headers:{'x-api-key':settings.apiKey,'accept':'application/json'},
      redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(14000)
    });
    if(res.status===401||res.status===403)return NextResponse.json({
      id,source:'roblox-open-cloud',status:'restricted',downloadable:false,
      explanation:'Roblox did not authorize reading this asset. Check creator ownership and the API key’s asset-read permissions; locked content cannot be extracted.'
    },{headers:{'Cache-Control':'private, no-store'}});
    if(res.status===404)return NextResponse.json({
      id,source:'roblox-open-cloud',status:'not_found',downloadable:false,
      explanation:'Roblox did not return this asset to the configured creator.'
    },{headers:{'Cache-Control':'private, no-store'}});
    if(!res.ok || res.status>=300)return NextResponse.json({
      id,source:'roblox-open-cloud',status:'unavailable',downloadable:false,
      explanation:'Roblox metadata lookup was unavailable (HTTP '+res.status+').'
    },{headers:{'Cache-Control':'private, no-store'}});
    if(!(res.headers.get('content-type')||'').toLowerCase().includes('application/json'))
      return NextResponse.json({
        id,source:'roblox-open-cloud',status:'metadata_unavailable',downloadable:false,
        explanation:'The Roblox response did not provide expected metadata. A download has not been authorized.'
      },{headers:{'Cache-Control':'private, no-store'}});
    const raw=await res.text();
    if(raw.length>150_000)throw new Error('Metadata size limit exceeded');
    const details=readRobloxMetadata(JSON.parse(raw),id);
    if(!details)return NextResponse.json({
      id,source:'roblox-open-cloud',status:'metadata_unavailable',downloadable:false,
      explanation:'Roblox returned no usable asset metadata.'
    },{headers:{'Cache-Control':'private, no-store'}});
    const owned=details.creatorType===owner&&details.creatorId===settings.ownerId;
    return NextResponse.json({
      id,source:'roblox-open-cloud',status:'metadata_only',name:details.name,
      assetType:details.assetType,creatorType:details.creatorType,creatorId:details.creatorId,
      description:details.description,downloadable:false,
      explanation:owned?
        'This asset is attributed to your configured creator, but no downloadable file is available through the current connected API. Supply your original file through Bulk Image Upload if you wish to republish it.':
        'Metadata is available, but source ownership/access is not established for this creator. No file will be extracted.'
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch{
    return NextResponse.json({
      id,source:'roblox-open-cloud',status:'unavailable',downloadable:false,
      explanation:'Roblox metadata could not be read. The asset may be restricted, the API key may lack read scope, or the service may be unavailable.'
    },{headers:{'Cache-Control':'private, no-store'}});
  }
}
