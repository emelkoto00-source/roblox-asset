import type { AssetRecord } from './db';

export const isArtifactAsset=(a:AssetRecord)=>a.rel_path.startsWith('Identity_Artifacts/');
type Frame={Frame:number;Image:string};
type Animation={Image:string|null;Frames:number;Columns:number;Rows:number;FrameWidth:number;FrameHeight:number;FPS:number;Loop:boolean;IndividualFrames:Frame[]};
type Style={
  Main:string|null;Base:string|null;Core:string|null;Ornaments:string|null;LevelFrame:string|null;Glints:string|null;
  Idle:Animation;Reveal:Animation;Reaction:Animation;
};
const createAnimation=(name:'Idle'|'Reveal'|'Reaction'):Animation=>({
  Image:null,Frames:16,Columns:4,Rows:4,FrameWidth:512,FrameHeight:256,FPS:12,Loop:name==='Idle',IndividualFrames:[]
});
const createStyle=():Style=>({
  Main:null,Base:null,Core:null,Ornaments:null,LevelFrame:null,Glints:null,
  Idle:createAnimation('Idle'),Reveal:createAnimation('Reveal'),Reaction:createAnimation('Reaction')
});
export function exportArtifactRegistry(assets:AssetRecord[]){
  const artifacts:Record<string,Style>={},pending:string[]=[];
  const staticNames:Record<string,keyof Style>={
    main:'Main',base:'Base',core:'Core',ornaments:'Ornaments',level_frame:'LevelFrame',glints:'Glints'
  };
  const animations:Record<string,'Idle'|'Reveal'|'Reaction'>={idle:'Idle',reveal:'Reveal',reaction:'Reaction'};
  for(const a of assets){
    if(!isArtifactAsset(a))continue;
    const style=artifacts[a.effect]??(artifacts[a.effect]=createStyle());
    if(a.status!=='created'||!a.asset_id){pending.push(a.rel_path);continue;}
    const key=a.kind.replace(/^art_/,'');
    const image='rbxassetid://'+a.asset_id;
    if(Object.hasOwn(staticNames,key)){
      (style as unknown as Record<string,unknown>)[staticNames[key]]=image;
      continue;
    }
    const match=key.match(/^(idle|reveal|reaction)_(sheet|frame)$/);
    if(!match)continue;
    const anim=style[animations[match[1]]];
    if(match[2]==='sheet')anim.Image=image;
    else{
      const frame=Number(a.rel_path.match(/_FRAME_(\d{2})\.png$/)?.[1]);
      if(frame>=1&&frame<=16)anim.IndividualFrames.push({Frame:frame,Image:image});
    }
  }
  for(const style of Object.values(artifacts))
    for(const kind of ['Idle','Reveal','Reaction'] as const)
      style[kind].IndividualFrames.sort((a,b)=>a.Frame-b.Frame);
  return {
    Pack:'EST Identity Artifacts V1',
    Status:'created_on_roblox_not_moderation_approved',
    Atlas:{Columns:4,Rows:4,FrameWidth:512,FrameHeight:256},
    LevelText:{Mode:'Dynamic Roblox TextLabel',Text:'LV. {level}',NormalizedCenter:[0.5,0.518]},
    Note:'Display the real player name and level dynamically; never bake text into artifact textures. Idle loops continuously, Reveal and Reaction play once then return to Idle.',
    Artifacts:artifacts,Pending:pending
  };
}
function lua(value:unknown,indent=0):string{
  if(value===null||value===undefined)return 'nil';
  if(typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'||typeof value==='boolean')return String(value);
  if(typeof value!=='object')return 'nil';
  const pad=' '.repeat(indent),nested=' '.repeat(indent+2);
  const entries=Array.isArray(value)
    ? value.map(v=>[null,v] as const)
    : Object.entries(value).map(([k,v])=>[k,v] as const);
  if(!entries.length)return '{}';
  return '{\n'+entries.map(([key,v])=>
    nested+(key===null?'':/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)?key+' = ':'['+JSON.stringify(key)+'] = ')+lua(v,indent+2)+','
  ).join('\n')+'\n'+pad+'}';
}
export function artifactRegistryToLuau(registry:ReturnType<typeof exportArtifactRegistry>){
  return '-- EST Identity Artifacts V1. Created Roblox assets still require moderation/visibility verification.\nreturn '+lua(registry)+'\n';
}
export function artifactRegistryToCSV(assets:AssetRecord[]){
  const quoted=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
  return ['Style,Type,Frame,Path,Status,RobloxAssetID,OperationID,Error'].concat(assets.map(a=>[
    a.effect,a.kind.replace(/^art_/,'').toUpperCase(),a.rel_path.match(/_FRAME_(\d{2})\.png$/)?.[1]||'',
    a.rel_path,a.status,a.asset_id,a.operation_ref,a.error_text
  ].map(quoted).join(','))).join('\r\n');
}
