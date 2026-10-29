import { NextResponse } from 'next/server';
import { guard } from '@/lib/http';
import { isManualAssetPath } from '@/lib/manualAssets';
import { buildManualRegistry,manualRegistryToCSV,manualRegistryToLuau } from '@/lib/manualExport';
import { getBatch,getAssets,exportRegistry,registryToLuau,registryToCSV,isCreativeAsset,exportCreativeRegistry,creativeRegistryToLuau,creativeRegistryToCSV,isSignatureAsset,exportSignatureRegistry,signatureRegistryToLuau,signatureRegistryToCSV,isArtifactAsset,exportArtifactRegistry,artifactRegistryToLuau,artifactRegistryToCSV } from '@est/core';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){
  const deny=await guard(request);if(deny)return deny;
  const {id}=await ctx.params;
  const batch=await getBatch(id);
  if(!batch)return NextResponse.json({error:'Batch not found'},{status:404});
  const assets=await getAssets(id);
  const type=new URL(request.url).searchParams.get('format')||'json';
  if(assets.some(a=>isManualAssetPath(a.rel_path))){
    const registry=buildManualRegistry(batch,assets);
    let body:string,mime:string,extension:string;
    if(type==='json'){body=JSON.stringify(registry,null,2);mime='application/json';extension='json';}
    else if(type==='csv'){body=manualRegistryToCSV(registry);mime='text/csv';extension='csv';}
    else if(type==='luau'){body=manualRegistryToLuau(registry);mime='text/plain';extension='luau';}
    else return NextResponse.json({error:'Unsupported export format'},{status:400});
    const filename='EST_AssetRegistry_'+id.slice(0,8)+'.'+extension;
    return new Response(body,{headers:{'Content-Type':mime+'; charset=utf-8',
      'Content-Disposition':'attachment; filename="'+filename+'"',
      'Cache-Control':'private, no-store'}});
  }
  const artifact=assets.some(isArtifactAsset);
  const signature=!artifact && assets.some(isSignatureAsset);
  const creative=!signature && assets.some(isCreativeAsset);
  const registry=artifact?exportArtifactRegistry(assets):signature?exportSignatureRegistry(assets):creative?exportCreativeRegistry(assets):exportRegistry(assets);
  let body:string,mime:string,ext:string;
  if(type==='luau'){body=artifact?artifactRegistryToLuau(registry as ReturnType<typeof exportArtifactRegistry>):signature?signatureRegistryToLuau(registry as ReturnType<typeof exportSignatureRegistry>):creative?creativeRegistryToLuau(registry as ReturnType<typeof exportCreativeRegistry>):registryToLuau(registry as ReturnType<typeof exportRegistry>);mime='text/plain';ext='luau'}
  else if(type==='csv'){body=artifact?artifactRegistryToCSV(assets):signature?signatureRegistryToCSV(assets):creative?creativeRegistryToCSV(assets):registryToCSV(assets);mime='text/csv';ext='csv'}
  else if(type==='json'){body=JSON.stringify(registry,null,2);mime='application/json';ext='json'}
  else return NextResponse.json({error:'Unsupported export'},{status:400});
  return new Response(body,{headers:{'Content-Type':`${mime}; charset=utf-8`,'Content-Disposition':`attachment; filename="${artifact?'EST_IdentityArtifactRegistry':signature?'EST_NameSignatureRegistry':creative?'EST_CreativeAssetRegistry':'EST_ParticleAssetRegistry'}_${id.slice(0,8)}.${ext}"`,'Cache-Control':'private, no-store'}});
}
