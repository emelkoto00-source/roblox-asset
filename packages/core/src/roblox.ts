import { creatorSettings, Ownership } from './config';
export class RobloxHttpError extends Error { constructor(public code:number,message:string){ super(message); } }
function cleanMessage(v:string){return v.slice(0,600).replace(/([a-zA-Z0-9_-]{30,})/g,'[redacted]')}
export async function publishImage(file:Buffer, name:string, ownerType:Ownership, description?:string) {
  const {ownerId,apiKey}=creatorSettings(ownerType);
  const creator=ownerType==='user'?{userId:ownerId}:{groupId:ownerId};
  const request={assetType:process.env.ROBLOX_ASSET_TYPE||'Decal',displayName:name.slice(0,50),description:(description||'EST V4 Cinematic Particle Collection').slice(0,1000),creationContext:{creator}};
  const form=new FormData();
  form.set('request',JSON.stringify(request));
  form.set('fileContent',new Blob([new Uint8Array(file)],{type:'image/png'}),'asset.png');
  // IMPORTANT: current endpoint/payload and creator permissions must be verified against the live Roblox Open Cloud docs.
  const res=await fetch(process.env.ROBLOX_CREATE_ASSET_URL||'https://apis.roblox.com/assets/v1/assets',{method:'POST',headers:{'x-api-key':apiKey},body:form,signal:AbortSignal.timeout(60_000)});
  const body=await res.text();
  if(!res.ok) throw new RobloxHttpError(res.status,`Roblox create returned HTTP ${res.status}: ${cleanMessage(body)}`);
  let result:any;
  try{result=JSON.parse(body)}catch{throw new Error('Roblox response was not JSON')}
  return result;
}
export function parseOperationRef(result:any):string|null {
  const value=result?.path||result?.name||result?.operationPath||result?.operationId||null;
  if(typeof value!=='string') return null;
  const id=value.split('/').pop();
  if(!id || !/^[\w-]+$/.test(id)) return null;
  return id;
}
export function parseCreatedId(result:any):string|null{
  const id=result?.response?.assetId ?? result?.response?.asset?.assetId ?? result?.assetId ?? result?.asset?.assetId;
  return typeof id==='string'||typeof id==='number'?String(id):null;
}
export async function checkOperation(opId:string,ownerType:Ownership){
  if (!/^[\w-]+$/.test(opId)) throw new Error('Invalid operation ID');
  const {apiKey}=creatorSettings(ownerType);
  const prefix=process.env.ROBLOX_OPERATION_URL_PREFIX||'https://apis.roblox.com/assets/v1/operations/';
  const res=await fetch(prefix+encodeURIComponent(opId),{headers:{'x-api-key':apiKey},signal:AbortSignal.timeout(15_000)});
  const body=await res.text();
  if(!res.ok) throw new RobloxHttpError(res.status,`Roblox operation returned HTTP ${res.status}: ${cleanMessage(body)}`);
  return JSON.parse(body);
}
