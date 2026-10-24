import { NextResponse } from 'next/server';
import { guard } from '@/lib/http';
import { getBatch,getAssets,exportRegistry,registryToLuau,registryToCSV,isCreativeAsset,exportCreativeRegistry,creativeRegistryToLuau,creativeRegistryToCSV,isSignatureAsset,exportSignatureRegistry,signatureRegistryToLuau,signatureRegistryToCSV } from '@est/core';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){
  const deny=await guard(request);if(deny)return deny;
  const {id}=await ctx.params;
  if(!await getBatch(id))return NextResponse.json({error:'Batch not found'},{status:404});
  const assets=await getAssets(id);
  const type=new URL(request.url).searchParams.get('format')||'json';
  const signature=assets.some(isSignatureAsset);
  const creative=!signature && assets.some(isCreativeAsset);
  const registry=signature?exportSignatureRegistry(assets):creative?exportCreativeRegistry(assets):exportRegistry(assets);
  let body:string,mime:string,ext:string;
  if(type==='luau'){body=signature?signatureRegistryToLuau(registry as ReturnType<typeof exportSignatureRegistry>):creative?creativeRegistryToLuau(registry as ReturnType<typeof exportCreativeRegistry>):registryToLuau(registry as ReturnType<typeof exportRegistry>);mime='text/plain';ext='luau'}
  else if(type==='csv'){body=signature?signatureRegistryToCSV(assets):creative?creativeRegistryToCSV(assets):registryToCSV(assets);mime='text/csv';ext='csv'}
  else if(type==='json'){body=JSON.stringify(registry,null,2);mime='application/json';ext='json'}
  else return NextResponse.json({error:'Unsupported export'},{status:400});
  return new Response(body,{headers:{'Content-Type':`${mime}; charset=utf-8`,'Content-Disposition':`attachment; filename="${signature?'EST_NameSignatureRegistry':creative?'EST_CreativeAssetRegistry':'EST_ParticleAssetRegistry'}_${id.slice(0,8)}.${ext}"`,'Cache-Control':'private, no-store'}});
}
