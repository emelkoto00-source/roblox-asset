import type { AssetRecord,BatchRecord } from '@est/core';
import { isManualAssetPath,originalIdFromPath } from './manualAssets';

export function buildManualRegistry(batch:BatchRecord,assets:AssetRecord[]){
  return {
    Pack:batch.filename,
    Owner:batch.owner_type,
    OwnerId:batch.owner_id,
    Moderation:'Creation is recorded; approval is not independently verified.',
    Assets:assets.filter(a=>isManualAssetPath(a.rel_path)).map(a=>({
      Name:a.effect,
      OriginalAssetId:originalIdFromPath(a.rel_path),
      RobloxAssetId:a.asset_id,
      RobloxURI:a.asset_id?'rbxassetid://'+a.asset_id:null,
      Status:a.status,
      OriginalFile:a.rel_path.split('/').pop(),
      Error:a.error_text,
    }))
  };
}
function luau(value:unknown,depth=0):string{
  if(value===null||value===undefined)return 'nil';
  if(typeof value==='string')return JSON.stringify(value);
  if(typeof value==='boolean'||typeof value==='number')return String(value);
  if(typeof value!=='object')return 'nil';
  const padding=' '.repeat(depth),indent=' '.repeat(depth+2);
  const cells=Array.isArray(value)
    ? value.map(v=>[null,v] as const)
    : Object.entries(value).map(([key,v])=>[key,v] as const);
  return cells.length?'{\n'+cells.map(([key,v])=>
    indent+(key===null?'':/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)?key+' = ':'['+JSON.stringify(key)+'] = ')+luau(v,depth+2)+','
  ).join('\n')+'\n'+padding+'}':'{}';
}
export function manualRegistryToLuau(registry:ReturnType<typeof buildManualRegistry>){
  return '-- EST Asset Cloud - Roblox image creation IDs (moderation not verified)\nreturn '+luau(registry)+'\n';
}
export function manualRegistryToCSV(registry:ReturnType<typeof buildManualRegistry>){
  const escape=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';
  return ['Name,OriginalAssetId,RobloxAssetId,RobloxURI,Status,OriginalFile,Error',
    ...registry.Assets.map(a=>[a.Name,a.OriginalAssetId,a.RobloxAssetId,a.RobloxURI,a.Status,a.OriginalFile,a.Error]
      .map(escape).join(','))].join('\r\n');
}
