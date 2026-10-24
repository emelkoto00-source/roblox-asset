import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
import type { Selection } from './config';
import type { ScannedAsset, ScanResult } from './scanner';

const PREFIX = 'EST_Name_Accents_Level_Identities_V3/';
const PACK = 'EST Creative Name Accents + Level Identities V3';
const MAX_ENTRIES = 900;
const MAX_UNCOMPRESSED = 120_000_000;
const MAX_FILE = 12_000_000;

type Expected = { effect:string; kind:ScannedAsset['kind']; category:string };
const clean = (path:string) => {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
      path.split('/').some(x=>x==='..'||x==='.') ) throw new Error('Unsafe ZIP path');
  return path.startsWith(PREFIX) ? path.slice(PREFIX.length) : path;
};

function expectedAssets(manifest:any):Map<string,Expected> {
  if (manifest?.pack!==PACK || manifest.version!=='3.0' ||
      !Array.isArray(manifest.collections) || manifest.collections.length!==20) {
    throw new Error('Expected EST Name Accents + Level Identities V3 manifest with 20 styles');
  }
  const result=new Map<string,Expected>();
  const categories:Record<string,number>={Name_Accents:0,Level_Identities:0};
  const add=(path:any,entry:Expected) => {
    if (typeof path!=='string'||!path.endsWith('.png')||
        !path.startsWith(entry.category+'/') || path!==clean(path) || result.has(path)) {
      throw new Error('Invalid or duplicate manifest asset path');
    }
    result.set(path,entry);
  };
  for (const c of manifest.collections) {
    if (!c || !['Name_Accents','Level_Identities'].includes(c.category) ||
        typeof c.name!=='string'||!c.name.trim()||
        typeof c.slug!=='string'||!Array.isArray(c.static)||c.static.length!==2) {
      throw new Error('Invalid V3 style in asset manifest');
    }
    categories[c.category]++;
    const base=c.category+'/'+String(c.index).padStart(2,'0')+'_'+c.slug+'/';
    if (!c.static.every((p:unknown)=>typeof p==='string' && p.startsWith(base+'01_Static_PNG/'))) {
      throw new Error('Unexpected static asset location');
    }
    for (const p of c.static) {
      const kind:ScannedAsset['kind']=p.endsWith('_MAIN.png')?'main':p.endsWith('_MOTIF.png')?'motif':'particle';
      if (kind==='particle')throw new Error('Expected MAIN and MOTIF assets');
      add(p,{effect:c.name,kind,category:c.category});
    }
    for (const anim of ['LOOP','BURST'] as const) {
      const a=c.animations?.[anim];
      if (!a || a.frame_count!==16 || a.columns!==4 || a.rows!==4 ||
          !Array.isArray(a.frames)||a.frames.length!==16) throw new Error('Invalid animation manifest: '+c.name);
      const sheetKind=anim==='LOOP'?'loop_sheet':'burst_sheet';
      const frameKind=anim==='LOOP'?'loop_frame':'burst_frame';
      if (typeof a.spritesheet!=='string' || !a.spritesheet.startsWith(base+'02_Animated_SpriteSheets/')) throw new Error('Invalid sprite sheet path');
      add(a.spritesheet,{effect:c.name,kind:sheetKind,category:c.category});
      a.frames.forEach((p:any,i:number)=>{
        if (typeof p!=='string'||!p.startsWith(base+'03_Individual_Frames/'+anim+'/') ||
            !p.endsWith('_FRAME_'+String(i+1).padStart(2,'0')+'.png')) throw new Error('Invalid animation frame order');
        add(p,{effect:c.name,kind:frameKind,category:c.category});
      });
    }
  }
  if (categories.Name_Accents!==12 || categories.Level_Identities!==8 || result.size!==720) {
    throw new Error('V3 pack requires 12 Name Accents, 8 Level Identities, and 720 possible PNGs');
  }
  return result;
}
const selected=(kind:ScannedAsset['kind'],mode:Selection)=>
  mode==='all' || (mode==='essential'
    ? ['main','motif','loop_sheet','burst_sheet'].includes(kind)
    : ['main','motif','loop_frame','burst_frame'].includes(kind));

export async function scanCreativeZip(buffer:Buffer,mode:Selection):Promise<ScanResult> {
  return new Promise((resolve,reject)=>{
    yauzl.fromBuffer(buffer,{lazyEntries:true,decodeStrings:true,validateEntrySizes:true},(openError,zip)=>{
      if(openError||!zip){reject(openError||new Error('Invalid ZIP'));return;}
      let settled=false,entries=0,total=0,manifest:any=null;
      const seen=new Set<string>(),pngPaths=new Set<string>(),assets:ScannedAsset[]=[];
      const fail=(err:Error)=>{if(!settled){settled=true;zip.close();reject(err);}};
      zip.on('error',fail);
      zip.on('entry',(entry)=>{
        try {
          entries++;if(entries>MAX_ENTRIES)throw new Error('Too many ZIP entries');
          const rel=clean(entry.fileName);
          if(seen.has(rel))throw new Error('Duplicate ZIP entry: '+rel);
          seen.add(rel);
          total+=entry.uncompressedSize;
          if(total>MAX_UNCOMPRESSED||entry.uncompressedSize>MAX_FILE)throw new Error('ZIP exceeds unpacking limits');
          if(entry.fileName.endsWith('/')){zip.readEntry();return;}
          const isManifest=rel==='ASSET_MANIFEST.json';
          const isPng=rel.toLowerCase().endsWith('.png');
          if(isPng)pngPaths.add(rel);
          const category=rel.split('/')[0];
          const isPackPng=isPng&&(category==='Name_Accents'||category==='Level_Identities');
          const isFrame=rel.includes('/03_Individual_Frames/');
          if(!isManifest && (!isPackPng || (mode==='essential'&&isFrame) ||
              (mode==='frames'&&rel.includes('/02_Animated_SpriteSheets/')))) {
            zip.readEntry();return;
          }
          zip.openReadStream(entry,(streamErr,stream)=>{
            if(streamErr||!stream){fail(streamErr||new Error('ZIP stream error'));return;}
            const chunks:Buffer[]=[];
            stream.on('data',(chunk:Buffer)=>chunks.push(chunk));
            stream.on('error',fail);
            stream.on('end',()=>{
              try {
                const data=Buffer.concat(chunks);
                if(isManifest)manifest=JSON.parse(data.toString('utf8'));
                else {
                  if(data.length<33||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' ||
                      ![4,6].includes(data[25]))throw new Error('Expected transparent PNG: '+rel);
                  assets.push({effect:'',kind:'main',path:rel,data,sha256:createHash('sha256').update(data).digest('hex')});
                }
                zip.readEntry();
              }catch(err){fail(err as Error);}
            });
          });
        }catch(err){fail(err as Error);}
      });
      zip.on('end',()=>{
        try {
          const expected=expectedAssets(manifest);
          for(const rel of pngPaths)if(!expected.has(rel))throw new Error('Unrecognized PNG in V3 pack: '+rel);
          if(pngPaths.size!==80&&pngPaths.size!==720)throw new Error('V3 ZIP must contain either 80 essential or 720 full PNG assets');
          const included=new Set<string>();
          for(const asset of assets){
            const spec=expected.get(asset.path);
            if(!spec||!selected(spec.kind,mode))throw new Error('Unexpected included asset: '+asset.path);
            asset.effect=spec.effect;asset.kind=spec.kind;
            included.add(asset.path);
            const category=spec.category;
            const isSheet=['loop_sheet','burst_sheet'].includes(spec.kind);
            const width=asset.data.readUInt32BE(16),height=asset.data.readUInt32BE(20);
            if(isSheet && (width!==(category==='Name_Accents'?2048:1024)||height!==1024)) {
              throw new Error('Incorrect V3 sprite sheet size: '+asset.path);
            }
          }
          const wanted=[...expected.entries()].filter(([,spec])=>selected(spec.kind,mode));
          if(included.size!==wanted.length||wanted.some(([p])=>!included.has(p)))
            throw new Error('V3 ZIP does not contain all files for the selected mode. Use the Full ZIP for Frames or Entire Collection.');
          const counts:Record<string,number>={};
          for(const asset of assets){
            const category=asset.path.split('/')[0];
            counts[category]=(counts[category]||0)+1;
          }
          if(!settled){settled=true;resolve({manifest,assets,counts,allPngCount:pngPaths.size,packType:'creative_v3'});}
        }catch(err){fail(err as Error);}
      });
      zip.readEntry();
    });
  });
}
