export type Owner='user'|'group';
export function validateAssetId(value:string):string{
  if(!/^[0-9]{1,20}$/.test(value))throw new Error('Enter a Roblox asset ID containing only digits (up to 20).');
  return value;
}
export function validateOwner(value:string):Owner{
  if(value!=='user'&&value!=='group')throw new Error('Select Personal creator or Roblox group.');
  return value;
}
export function safeFilename(value:string):string{
  const cleaned=(value||'asset').replaceAll('\\','/').split('/').pop()!
    .replace(/\.[^/.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,64);
  return cleaned.replace(/^_+|_+$/g,'')||'asset';
}
export function readRobloxMetadata(value:unknown,sourceId:string){
  if(!value||typeof value!=='object')return null;
  const root=value as Record<string,any>;
  const asset=root.asset&&typeof root.asset==='object'?root.asset:root;
  const creator=asset.creationContext?.creator||asset.creator||root.creationContext?.creator||root.creator||{};
  const ownerType=creator.userId!==undefined?'user':creator.groupId!==undefined?'group':null;
  const ownerId=ownerType==='user'?String(creator.userId):ownerType==='group'?String(creator.groupId):null;
  const assetId=asset.assetId||asset.id||root.assetId||sourceId;
  const name=typeof asset.displayName==='string'?asset.displayName:
    typeof asset.name==='string'?asset.name:null;
  const kind=typeof asset.assetType==='string'?asset.assetType:
    typeof asset.type==='string'?asset.type:null;
  return {
    assetId:String(assetId).slice(0,80),name:name?.slice(0,160)||null,
    assetType:kind?.slice(0,80)||null,
    creatorType:ownerType,creatorId:ownerId,
    description:typeof asset.description==='string'?asset.description.slice(0,600):null
  };
}
export function fileIsLocallyDownloadable(kind:string,status:string,assetId:string|null){
  return status==='created'&&!!assetId&&kind.length>0;
}
