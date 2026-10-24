import type { AssetRecord } from './db';

const dimensions=(category:string)=>category==='Name_Accents'?{width:512,height:256}:{width:256,height:256};
export const isCreativeAsset=(asset:AssetRecord)=>/^(Name_Accents|Level_Identities)\//.test(asset.rel_path);
export function exportCreativeRegistry(assets:AssetRecord[]){
  const result:Record<string,Record<string,any>>={NameAccents:{},LevelIdentities:{}};
  const pending:string[]=[];
  for(const a of assets){
    const category=a.rel_path.startsWith('Name_Accents/')?'NameAccents':
      a.rel_path.startsWith('Level_Identities/')?'LevelIdentities':null;
    if(!category)continue;
    const group=result[category];
    if(!group[a.effect])group[a.effect]={Main:null,Motif:null,Loop:null,Burst:null,LoopFrames:[],BurstFrames:[]};
    if(a.status!=='created'||!a.asset_id){pending.push(a.rel_path);continue;}
    const entry=group[a.effect];
    const image='rbxassetid://'+a.asset_id;
    if(a.kind==='main')entry.Main=image;
    else if(a.kind==='motif')entry.Motif=image;
    else if(a.kind==='loop_sheet'||a.kind==='burst_sheet'){
      const sz=dimensions(category==='NameAccents'?'Name_Accents':'Level_Identities');
      entry[a.kind==='loop_sheet'?'Loop':'Burst']={Image:image,Frames:16,Columns:4,Rows:4,FrameWidth:sz.width,FrameHeight:sz.height,Loop:a.kind==='loop_sheet'};
    }else if(a.kind==='loop_frame'||a.kind==='burst_frame'){
      const match=a.rel_path.match(/_FRAME_(\d{2})\.png$/);
      entry[a.kind==='loop_frame'?'LoopFrames':'BurstFrames'].push({Frame:match?Number(match[1]):0,Image:image});
    }
  }
  for(const group of Object.values(result)){
    for(const entry of Object.values(group)){
      entry.LoopFrames.sort((a:any,b:any)=>a.Frame-b.Frame);
      entry.BurstFrames.sort((a:any,b:any)=>a.Frame-b.Frame);
    }
  }
  return {status:'created_on_roblox_not_moderation_approved',pack:'EST Creative Name Accents + Level Identities V3',NameAccents:result.NameAccents,LevelIdentities:result.LevelIdentities,pending};
}
const lua=(value:string)=>JSON.stringify(value);
export function creativeRegistryToLuau(registry:ReturnType<typeof exportCreativeRegistry>){
  const lines=['-- EST Name Accents + Level Identities V3. Roblox creation does not guarantee moderation approval.','return {'];
  for(const [cat,items] of [['NameAccents',registry.NameAccents],['LevelIdentities',registry.LevelIdentities]] as const){
    lines.push('  '+cat+' = {');
    for(const [name,a] of Object.entries(items)){
      lines.push('    ['+lua(name)+'] = {');
      for(const field of ['Main','Motif'] as const)lines.push('      '+field+' = '+(a[field]?lua(a[field]):'nil')+',');
      for(const field of ['Loop','Burst'] as const){
        const animation=a[field];
        lines.push('      '+field+' = '+(animation?'{ Image = '+lua(animation.Image)+', Frames = 16, Columns = 4, Rows = 4, FrameWidth = '+animation.FrameWidth+', FrameHeight = '+animation.FrameHeight+', Loop = '+String(animation.Loop)+' }':'nil')+',');
      }
      for(const field of ['LoopFrames','BurstFrames'] as const){
        lines.push('      '+field+' = {');
        for(const frame of a[field])lines.push('        { Frame = '+frame.Frame+', Image = '+lua(frame.Image)+' },');
        lines.push('      },');
      }
      lines.push('    },');
    }
    lines.push('  },');
  }
  lines.push('}');
  return lines.join('\n');
}
export function creativeRegistryToCSV(assets:AssetRecord[]){
  const escape=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
  return ['Category,Style,Type,Path,Status,RobloxAssetID,OperationID,Error'].concat(assets.map(a=>[
    a.rel_path.split('/')[0],a.effect,a.kind,a.rel_path,a.status,a.asset_id,a.operation_ref,a.error_text
  ].map(escape).join(','))).join('\r\n');
}
