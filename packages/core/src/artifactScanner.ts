import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
import type { Selection } from './config';
import type { ScannedAsset, ScanResult } from './scanner';

export const ARTIFACT_PACK = 'EST Identity Artifacts V1';
const ROOT = 'EST_Identity_Artifacts_V1/';
const STATIC_KINDS = ['MAIN','BASE','CORE','ORNAMENTS','LEVEL_FRAME','GLINTS'] as const;
const ANIMATIONS = ['IDLE','REVEAL','REACTION'] as const;
const MAX_ENTRIES=350,MAX_EXPANDED=120_000_000,MAX_SINGLE=8_000_000;
type Spec = {name:string;kind:string;sha256:string};

export function isNumberedArtifactAnimationFrame(kind:string):boolean{
  return ANIMATIONS.some(animation=>kind===animation+'_FRAME');
}

function normalized(path:string){
  if(!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
    path.split('/').some(segment=>segment==='.'||segment==='..'))throw new Error('Unsafe ZIP path');
  return path.startsWith(ROOT)?path.slice(ROOT.length):path;
}
function manifestFiles(m:any):Map<string,Spec>{
  if(m?.pack!==ARTIFACT_PACK || m.version!=='1.0' ||
    m.assetCountFull!==285 || m.assetCountEssential!==45 ||
    !Array.isArray(m.styles) || m.styles.length!==5 ||
    !Array.isArray(m.assets) || m.assets.length!==285 ||
    m.animation?.columns!==4 || m.animation?.rows!==4 ||
    m.animation?.frameCount!==16 || m.animation?.frameWidth!==512 ||
    m.animation?.frameHeight!==256 || m.animation?.atlasWidth!==2048 ||
    m.animation?.atlasHeight!==1024){
    throw new Error('Expected EST Identity Artifacts V1 manifest with 5 styles and 285 assets');
  }
  const expected=new Map<string,Spec>();
  const uniqueStyles=new Set<string>();
  const add=(path:unknown,name:string,kind:string)=>{
    if(typeof path!=='string'||!path.endsWith('.png')||
      path!==normalized(path)||expected.has(path))throw new Error('Invalid or duplicate artifact asset path');
    expected.set(path,{name,kind,sha256:''});
  };
  for(const [index,style] of m.styles.entries()){
    if(!style || style.index!==index+1 || typeof style.name!=='string' || !style.name.trim() ||
      typeof style.slug!=='string' || !/^[A-Za-z0-9_]+$/.test(style.slug) ||
      style.folder!=='Identity_Artifacts/'+String(index+1).padStart(2,'0')+'_'+style.slug ||
      uniqueStyles.has(style.name))throw new Error('Invalid artifact style metadata');
    uniqueStyles.add(style.name);
    for(const kind of STATIC_KINDS){
      const path=style.static?.[kind];
      if(typeof path!=='string' || !path.startsWith(style.folder+'/01_Static_PNG/') ||
        !path.endsWith('_'+kind+'.png'))throw new Error('Invalid '+kind+' asset: '+style.name);
      add(path,style.name,kind);
    }
    for(const anim of ANIMATIONS){
      const detail=style.animations?.[anim];
      if(!detail || detail.columns!==4 || detail.rows!==4 ||
        detail.frameSize?.[0]!==512 || detail.frameSize?.[1]!==256 ||
        !Array.isArray(detail.frames) || detail.frames.length!==16 ||
        typeof detail.sheet!=='string' ||
        !detail.sheet.startsWith(style.folder+'/02_Animated_SpriteSheets/') ||
        !detail.sheet.endsWith('_'+anim+'_ATLAS_4x4.png')){
        throw new Error('Invalid '+anim+' animation data: '+style.name);
      }
      add(detail.sheet,style.name,anim+'_SHEET');
      for(let frame=0;frame<16;frame++){
        const path=detail.frames[frame];
        if(typeof path!=='string' ||
          !path.startsWith(style.folder+'/03_Numbered_Animation_Frames/'+anim+'/') ||
          !path.endsWith('_'+anim+'_FRAME_'+String(frame+1).padStart(2,'0')+'.png')){
          throw new Error('Invalid '+anim+' frame ordering: '+style.name);
        }
        add(path,style.name,anim+'_FRAME');
      }
    }
  }
  if(expected.size!==285)throw new Error('Artifact manifest paths do not describe exactly 285 PNGs');
  for(const entry of m.assets){
    if(!entry || entry.category!=='Identity_Artifacts' || typeof entry.path!=='string' ||
      typeof entry.kind!=='string' || typeof entry.sha256!=='string' ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) ||
      !Number.isInteger(entry.bytes) || entry.bytes<33){
      throw new Error('Invalid artifact manifest asset declaration');
    }
    const expectedEntry=expected.get(entry.path);
    if(!expectedEntry || expectedEntry.kind!==entry.kind ||
      expectedEntry.name!==entry.style || expectedEntry.sha256){
      throw new Error('Unexpected or duplicate artifact asset declaration: '+entry.path);
    }
    // LEVEL_FRAME is a static level-decoration PNG, not a numbered animation frame.
    // Only IDLE_FRAME, REVEAL_FRAME, and REACTION_FRAME require a frame index.
    if(isNumberedArtifactAnimationFrame(entry.kind)){
      const frame=Number(entry.path.match(/_FRAME_(\d{2})\.png$/)?.[1]);
      if(entry.frame!==frame)throw new Error('Frame number mismatch: '+entry.path);
    }
    expectedEntry.sha256=entry.sha256;
  }
  if([...expected.values()].some(s=>!s.sha256))throw new Error('Incomplete artifact manifest hashes');
  return expected;
}
const selected=(kind:string,mode:Selection)=>
  mode==='all' || STATIC_KINDS.includes(kind as typeof STATIC_KINDS[number]) ||
  (mode==='essential'?kind.endsWith('_SHEET'):kind.endsWith('_FRAME'));

export async function scanArtifactsZip(buffer:Buffer,mode:Selection):Promise<ScanResult>{
  return new Promise((resolve,reject)=>{
    yauzl.fromBuffer(buffer,{lazyEntries:true,decodeStrings:true,validateEntrySizes:true},(openErr,zip)=>{
      if(openErr||!zip){reject(openErr||new Error('Invalid ZIP'));return;}
      let settled=false,entries=0,total=0,manifest:any=null;
      const seen=new Set<string>(),pngPaths=new Set<string>(),assets:ScannedAsset[]=[];
      const fail=(error:Error)=>{if(!settled){settled=true;zip.close();reject(error);}};
      zip.on('error',fail);
      zip.on('entry',entry=>{
        try{
          entries++;if(entries>MAX_ENTRIES)throw new Error('Too many artifact ZIP entries');
          const path=normalized(entry.fileName);
          if(seen.has(path))throw new Error('Duplicate ZIP entry: '+path);
          seen.add(path);
          total+=entry.uncompressedSize;
          if(total>MAX_EXPANDED||entry.uncompressedSize>MAX_SINGLE)
            throw new Error('Artifact ZIP exceeds decompression safety limits');
          if(entry.fileName.endsWith('/')){zip.readEntry();return;}
          const isManifest=path==='ASSET_MANIFEST.json';
          const png=path.toLowerCase().endsWith('.png');
          if(png)pngPaths.add(path);
          const asset=png && path.startsWith('Identity_Artifacts/');
          const frame=path.includes('/03_Numbered_Animation_Frames/');
          const sheet=path.includes('/02_Animated_SpriteSheets/');
          if(!isManifest && (!asset || (mode==='essential'&&frame) || (mode==='frames'&&sheet))){
            zip.readEntry();return;
          }
          zip.openReadStream(entry,(err,stream)=>{
            if(err||!stream){fail(err||new Error('Unable to read ZIP entry'));return;}
            const chunks:Buffer[]=[];
            stream.on('data',(chunk:Buffer)=>chunks.push(chunk));
            stream.on('error',fail);
            stream.on('end',()=>{
              try{
                const data=Buffer.concat(chunks);
                if(isManifest)manifest=JSON.parse(data.toString('utf8'));
                else{
                  if(data.length<33 || data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' ||
                    ![4,6].includes(data[25]))throw new Error('Expected transparent artifact PNG: '+path);
                  const w=data.readUInt32BE(16),h=data.readUInt32BE(20);
                  if(sheet ? (w!==2048||h!==1024) : (w!==512||h!==256))
                    throw new Error('Unexpected artifact PNG dimensions: '+path);
                  assets.push({effect:'',kind:'art_main',path,data,sha256:createHash('sha256').update(data).digest('hex')});
                }
                zip.readEntry();
              }catch(e){fail(e as Error);}
            });
          });
        }catch(e){fail(e as Error);}
      });
      zip.on('end',()=>{
        try{
          const expected=manifestFiles(manifest);
          if(pngPaths.size!==45&&pngPaths.size!==285)
            throw new Error('Artifact ZIP must contain exactly 45 Essential or 285 Full PNGs');
          for(const path of pngPaths)
            if(!expected.has(path))throw new Error('Unknown PNG in artifact collection: '+path);
          const required=[...expected.entries()].filter(([,x])=>selected(x.kind,mode));
          const included=new Set<string>();
          for(const a of assets){
            const spec=expected.get(a.path);
            if(!spec || !selected(spec.kind,mode) || spec.sha256!==a.sha256)
              throw new Error('Modified or mismatched artifact PNG: '+a.path);
            a.effect=spec.name;
            a.kind=('art_'+spec.kind.toLowerCase()) as ScannedAsset['kind'];
            included.add(a.path);
          }
          if(included.size!==required.length || required.some(([path])=>!included.has(path)))
            throw new Error('Missing selected files. Use the Full 285 ZIP for Frames/All; Essential 45 is for Essential mode.');
          const counts:Record<string,number>={};
          for(const a of assets)counts[a.effect]=(counts[a.effect]||0)+1;
          if(!settled){settled=true;resolve({manifest,assets,counts,allPngCount:pngPaths.size,packType:'artifacts_v1'});}
        }catch(e){fail(e as Error);}
      });
      zip.readEntry();
    });
  });
}
