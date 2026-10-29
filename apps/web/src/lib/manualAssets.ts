export const MAX_MANUAL_FILES = 30;
export const MAX_INPUT_IMAGE_BYTES = 8_000_000;
export const MAX_TOTAL_INPUT_BYTES = 75_000_000;
export const MAX_OUTPUT_IMAGE_BYTES = 8_000_000;
export const MAX_IMAGE_PIXELS = 24_000_000;
export const ALLOWED_IMAGE_FORMATS = new Set(['png','jpeg','webp']);

export type ManualWorkflow = 'upload'|'migration';
export function validateManualRequest(input:{
  workflow:string;owner:string;sourceId:string;rights:string;
  confirmed:boolean;files:{name:string;size:number}[];
}) {
  if(input.workflow!=='upload'&&input.workflow!=='migration')throw Error('Invalid workflow');
  if(input.owner!=='user'&&input.owner!=='group')throw Error('Invalid destination owner');
  if(!input.confirmed)throw Error('You must confirm you own or have permission to upload the selected images');
  if(input.files.length===0)throw Error('Select at least one image');
  if(input.files.length>MAX_MANUAL_FILES)throw Error('Use at most 30 images per batch');
  if(input.files.some(f=>f.size<=0||f.size>MAX_INPUT_IMAGE_BYTES))
    throw Error('Each image must be nonempty and 8 MB or less');
  if(input.files.reduce((sum,f)=>sum+f.size,0)>MAX_TOTAL_INPUT_BYTES)
    throw Error('Total selected image size exceeds 75 MB');
  if(input.workflow==='migration'){
    if(!/^[0-9]{1,20}$/.test(input.sourceId))throw Error('Enter a valid numeric Roblox source asset ID');
    if(input.files.length!==1)throw Error('Migrate one authorized source image at a time');
    if(input.rights!=='owned'&&input.rights!=='licensed')
      throw Error('You must own the source asset or have permission to republish it');
  }
}
export function safeAssetName(filename:string){
  const last=filename.replaceAll('\\','/').split('/').pop()||'image';
  return (last.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,55)||'image');
}
export function isManualAssetPath(path:string){return path.startsWith('Manual_Images/')||path.startsWith('Authorized_Migrations/');}
export function originalIdFromPath(path:string){
  return path.startsWith('Authorized_Migrations/')?path.split('/')[1]||null:null;
}
