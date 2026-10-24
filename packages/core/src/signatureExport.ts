import type { AssetRecord } from './db';

export const isSignatureAsset=(a:AssetRecord)=>/^(Cinematic_Reveals|Premium_Text_Finishes|Reactive_Effects)\//.test(a.rel_path);
const palettes:Record<string,[string,string,string]>={
  'Sakura Prism':['#FEC4E5','#F572C2','#8AC8FF'],
  'Celestial Chrome':['#F3F4FF','#B9A6F7','#71D4FF'],
  'Frosted Glass':['#E9FDFF','#7AD9FF','#BAF5FF'],
  'Hologram Neon':['#75EBFF','#DE78FF','#FF7ED6'],
  'Royal Gold':['#FFF6C2','#FFBE48','#EC8B1D'],
  'Noir Glitch':['#EBE7F7','#8E84AD','#4B3D75'],
  'Ocean Pulse':['#A9FFFF','#27A9F6','#0C52CA'],
  'Sunset Glow':['#FFE39B','#FF8689','#B24FFF'],
  'Emerald Mythic':['#DEFFBD','#64DAA8','#269B98'],
  'Solar Ember':['#FFF2A3','#FF983F','#E74D68'],
  'Violet Nebula':['#F7BAFC','#9252F5','#4F99FF'],
  'Pearlescent':['#F8EEFF','#CAE6FC','#F5BCE4'],
};
const categories:Record<string,string>={
  Cinematic_Reveals:'Reveals',
  Premium_Text_Finishes:'TextFinishes',
  Reactive_Effects:'Reactions',
};
type Anim = {Image:string|null;Frames:number;Columns:number;Rows:number;FrameWidth:number;FrameHeight:number;FPS:number;Loop:boolean;IndividualFrames:{Frame:number;Image:string}[]};
type Style = {Main?:string;Motif?:string;Texture?:string;Material?:string;Reveal?:Anim;Settle?:Anim;Shine?:Anim;Trigger?:Anim;Afterglow?:Anim;Gradient?:any;Stroke?:any};
export function exportSignatureRegistry(assets:AssetRecord[]){
  const registry:Record<string,Record<string,Style>>={Reveals:{},TextFinishes:{},Reactions:{}};
  const pending:string[]=[];
  // Create all style entries, including styles that have not yet finished uploading.
  for(const a of assets){
    const category=categories[a.rel_path.split('/')[0]];
    if(!category)continue;
    const entries=registry[category];
    const style=entries[a.effect]??(entries[a.effect]={});
    if(category==='TextFinishes'&&!style.Gradient){
      const colors=palettes[a.effect];
      if(colors){
        style.Gradient={Keypoints:[{Time:0,Color:colors[0]},{Time:0.48,Color:colors[1]},{Time:1,Color:colors[2]}],Rotation:25};
        style.Stroke={Color:colors[1],Transparency:0.3,Thickness:1.4};
      }
    }
    if(a.status!=='created'||!a.asset_id){pending.push(a.rel_path);continue;}
    const kind=a.kind.replace(/^sig_/,'').toUpperCase();
    const image='rbxassetid://'+a.asset_id;
    if(['MAIN','MOTIF','TEXTURE','MATERIAL'].includes(kind)){
      const field=kind[0]+kind.slice(1).toLowerCase() as keyof Style;
      (style as Record<string,any>)[field]=image;
      continue;
    }
    const m=kind.match(/^(REVEAL|SETTLE|SHINE|TRIGGER|AFTERGLOW)_(SHEET|FRAME)$/);
    if(!m)continue;
    const field=m[1][0]+m[1].slice(1).toLowerCase();
    const animKey=field as keyof Style;
    const anim=(style[animKey]??{
      Image:null,Frames:16,Columns:4,Rows:4,FrameWidth:512,FrameHeight:256,
      FPS:m[1]==='REVEAL'||m[1]==='TRIGGER'?16:12,Loop:m[1]==='SHINE',IndividualFrames:[]
    }) as Anim;
    (style as Record<string,any>)[field]=anim;
    if(m[2]==='SHEET')anim.Image=image;
    else{
      const frame=Number(a.rel_path.match(/_FRAME_(\d{2})\.png$/)?.[1]||0);
      anim.IndividualFrames.push({Frame:frame,Image:image});
    }
  }
  for(const styles of Object.values(registry))
    for(const style of Object.values(styles))
      for(const anim of ['Reveal','Settle','Shine','Trigger','Afterglow'] as const)
        style[anim]?.IndividualFrames.sort((a,b)=>a.Frame-b.Frame);
  return {
    Pack:'EST Name Signature V1',Status:'created_on_roblox_not_moderation_approved',
    Atlas:{Columns:4,Rows:4,FrameWidth:512,FrameHeight:256},
    Note:'Apply finishes to live TextLabels with UIGradient and UIStroke; do not use textures as baked player names.',
    Reveals:registry.Reveals,TextFinishes:registry.TextFinishes,Reactions:registry.Reactions,Pending:pending
  };
}

function toLua(value:any,indent=0):string {
  if(value===null||value===undefined)return 'nil';
  if(typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'||typeof value==='boolean')return String(value);
  if(typeof value!=='object')return 'nil';
  const pad=' '.repeat(indent),inner=' '.repeat(indent+2);
  const entries=Array.isArray(value)
    ? value.map((v,i)=>[null,v] as const)
    : Object.entries(value).map(([k,v])=>[k,v] as const);
  if(!entries.length)return '{}';
  return '{\n'+entries.map(([k,v])=>
    inner+(k===null?'':/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)?k+' = ':'['+JSON.stringify(k)+'] = ')+toLua(v,indent+2)+','
  ).join('\n')+'\n'+pad+'}';
}
export function signatureRegistryToLuau(registry:ReturnType<typeof exportSignatureRegistry>){
  return '-- EST Name Signature V1. Roblox created IDs do not guarantee asset moderation approval.\nreturn '+toLua(registry)+'\n';
}
export function signatureRegistryToCSV(assets:AssetRecord[]){
  const q=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
  return ['Category,Style,Type,Frame,Path,Status,RobloxAssetID,OperationID,Error'].concat(
    assets.map(a=>[
      a.rel_path.split('/')[0],a.effect,a.kind.replace(/^sig_/,''),a.rel_path.match(/_FRAME_(\d{2})\.png$/)?.[1]||'',
      a.rel_path,a.status,a.asset_id,a.operation_ref,a.error_text
    ].map(q).join(','))
  ).join('\r\n');
}
