import { AssetRecord } from './db';
const names = ['Sparkles','Hearts','Snow','Embers','Bubbles','Orbit','Petals','Confetti','Lightning','Smoke','Shooting Stars','Pixel','Music','Waves','Fireflies'];
export function exportRegistry(assets:AssetRecord[]){
  const output:Record<string,any>={};
  for (const effect of names) output[effect]={Particles:[],Burst:null,Ambient:null};
  const pending:string[]=[];
  for (const a of assets){
    if (!a.asset_id || a.status!=='created'){pending.push(a.rel_path);continue;}
    const obj=output[a.effect];if(!obj) continue;
    const image=`rbxassetid://${a.asset_id}`;
    if(a.kind==='particle') obj.Particles.push({name:a.rel_path.split('/').pop(),image});
    if(a.kind==='burst_sheet') obj.Burst={image,frames:16,columns:4,rows:4,loop:false};
    if(a.kind==='loop_sheet') obj.Ambient={image,frames:16,columns:4,rows:4,loop:true};
    // Raw individual frames are preserved in the CSV export. Export users should prefer sheets.
  }
  return {status:'created_on_roblox_not_moderation_approved',effects:output,pending};
}
function luaString(s:string){return JSON.stringify(s)}
export function registryToLuau(registry:ReturnType<typeof exportRegistry>){
  const lines=['-- EST V4 asset references. `created` does not guarantee moderation approval.','return {'];
  for (const [effect,e] of Object.entries(registry.effects)){
    lines.push(`  [${luaString(effect)}] = {`);
    lines.push('    Particles = {');
    for(const p of e.Particles) lines.push(`      { Name = ${luaString(p.name)}, Image = ${luaString(p.image)} },`);
    lines.push('    },');
    for(const [k,field] of [['Burst',e.Burst],['Ambient',e.Ambient]] as const){
      if(!field){lines.push(`    ${k} = nil,`);continue;}
      lines.push(`    ${k} = { Image = ${luaString(field.image)}, Frames = 16, Columns = 4, Rows = 4, Loop = ${field.loop} },`);
    }
    lines.push('  },');
  }
  return lines.concat('}').join('\n');
}
export function registryToCSV(assets:AssetRecord[]){
  const escape=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
  return ['Effect,Type,Path,Status,RobloxAssetID,OperationID,Error'].concat(assets.map(a=>[a.effect,a.kind,a.rel_path,a.status,a.asset_id,a.operation_ref,a.error_text].map(escape).join(','))).join('\r\n');
}
