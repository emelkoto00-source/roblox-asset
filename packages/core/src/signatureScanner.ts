import yauzl from 'yauzl';
import { createHash } from 'node:crypto';
import type { Selection } from './config';
import type { ScannedAsset, ScanResult } from './scanner';

const ROOT = 'EST_Name_Signature_V1/';
export const SIGNATURE_PACK = 'EST Name Signature V1 — Reveal FX, Text Finishes, Gameplay Reactions';
const CATEGORIES: Record<string,number> = {
  Cinematic_Reveals: 10,
  Premium_Text_Finishes: 12,
  Reactive_Effects: 8,
};
const STATIC = new Set(['MAIN','MOTIF','TEXTURE','MATERIAL']);
const ANIMATION = new Set(['REVEAL','SETTLE','SHINE','TRIGGER','AFTERGLOW']);
const MAX_ENTRIES = 950, MAX_EXPANDED = 150_000_000, MAX_ENTRY = 12_000_000;
type Expected = { category:string; name:string; kind:string; sha256:string; frame:number|null };
function strip(path:string) {
  if(!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
    path.split('/').some(p=>p==='.' || p==='..'))throw new Error('Unsafe ZIP path');
  return path.startsWith(ROOT)?path.slice(ROOT.length):path;
}
function expectedFromManifest(m:any):Map<string,Expected>{
  if(!m || m.pack!==SIGNATURE_PACK || m.version!=='1.0' ||
    !Array.isArray(m.collections) || m.collections.length!==30 ||
    !Array.isArray(m.assets) || m.assets.length!==876 || m.assetCount!==876 ||
    m.atlas?.columns!==4 || m.atlas?.rows!==4 ||
    m.atlas?.frameWidth!==512 || m.atlas?.frameHeight!==256){
    throw new Error('Expected EST Name Signature V1 manifest with 30 styles, 876 assets and 4x4 atlases');
  }
  const styleKeys = new Set<string>();
  const categoryStyles:Record<string,number>={};
  for(const c of m.collections){
    if(!c || !Object.hasOwn(CATEGORIES,c.category) || typeof c.name!=='string' ||
      typeof c.slug!=='string' || !/^[A-Za-z0-9_]+$/.test(c.slug) ||
      !Number.isInteger(c.index) || c.index<1 || c.index>CATEGORIES[c.category])
      throw new Error('Invalid style metadata in Signature V1 manifest');
    const key=c.category+'/'+String(c.index).padStart(2,'0')+'_'+c.slug;
    if(styleKeys.has(key))throw new Error('Duplicate Signature V1 style');
    styleKeys.add(key);
    categoryStyles[c.category]=(categoryStyles[c.category]||0)+1;
  }
  for(const [cat,count] of Object.entries(CATEGORIES))
    if(categoryStyles[cat]!==count)throw new Error('Unexpected style count in '+cat);

  const map=new Map<string,Expected>();
  const kindCount:Record<string,number>={};
  for(const a of m.assets){
    if(!a || !Object.hasOwn(CATEGORIES,a.category) ||
      typeof a.style!=='string' || typeof a.path!=='string' ||
      typeof a.kind!=='string' || typeof a.sha256!=='string' ||
      !/^[0-9a-f]{64}$/.test(a.sha256) || strip(a.path)!==a.path ||
      !a.path.toLowerCase().endsWith('.png'))throw new Error('Invalid asset entry in Signature V1 manifest');
    const dir=a.path.split('/').slice(0,2).join('/');
    if(!styleKeys.has(dir) || a.path.split('/')[0]!==a.category ||
      map.has(a.path))throw new Error('Unexpected or duplicate Signature V1 asset path: '+a.path);
    const isStatic=STATIC.has(a.kind);
    const match=a.kind.match(/^(REVEAL|SETTLE|SHINE|TRIGGER|AFTERGLOW)_(SHEET|FRAME)$/);
    if(!isStatic&&!match)throw new Error('Unknown Signature V1 asset kind: '+a.kind);
    if(isStatic && !a.path.includes('/01_Static_PNG/'))throw new Error('Invalid static path: '+a.path);
    if(match?.[2]==='SHEET' && !a.path.includes('/02_Animated_SpriteSheets/'))throw new Error('Invalid sheet path: '+a.path);
    if(match?.[2]==='FRAME' && (!a.path.includes('/03_Individual_Frames/'+match[1]+'/') ||
      !/_FRAME_(0[1-9]|1[0-6])\.png$/.test(a.path)))throw new Error('Invalid numbered frame: '+a.path);
    if(isStatic && !['MAIN','MOTIF'].includes(a.kind) && a.category!=='Premium_Text_Finishes')
      throw new Error('Finish material asset in wrong category');
    if(a.category==='Premium_Text_Finishes' && isStatic && !['TEXTURE','MATERIAL'].includes(a.kind))
      throw new Error('Unexpected finish static asset');
    const frame=match?.[2]==='FRAME'?Number(a.path.match(/_FRAME_(\d{2})\.png$/)?.[1]):null;
    map.set(a.path,{category:a.category,name:a.style,kind:a.kind,sha256:a.sha256,frame});
    kindCount[a.kind]=(kindCount[a.kind]||0)+1;
  }
  const kinds:Record<string,number>={
    MAIN:18,MOTIF:18,TEXTURE:12,MATERIAL:12,
    REVEAL_SHEET:10,SETTLE_SHEET:10,SHINE_SHEET:12,TRIGGER_SHEET:8,AFTERGLOW_SHEET:8,
    REVEAL_FRAME:160,SETTLE_FRAME:160,SHINE_FRAME:192,TRIGGER_FRAME:128,AFTERGLOW_FRAME:128,
  };
  for(const [kind,count] of Object.entries(kinds))
    if(kindCount[kind]!==count)throw new Error('Signature V1 manifest kind count mismatch: '+kind);
  return map;
}
const chosen=(kind:string,mode:Selection)=>mode==='all' ||
  STATIC.has(kind) || (mode==='essential'?kind.endsWith('_SHEET'):kind.endsWith('_FRAME'));

export async function scanSignatureZip(buffer:Buffer,mode:Selection):Promise<ScanResult>{
  return new Promise((resolve,reject)=>{
    yauzl.fromBuffer(buffer,{lazyEntries:true,decodeStrings:true,validateEntrySizes:true},(err,zip)=>{
      if(err||!zip){reject(err||new Error('Invalid ZIP'));return;}
      let settled=false,entries=0,expanded=0,manifest:any=null;
      const seen=new Set<string>(),pngs=new Set<string>(),assets:ScannedAsset[]=[];
      const fail=(e:Error)=>{if(!settled){settled=true;zip.close();reject(e);}};
      zip.on('error',fail);
      zip.on('entry',entry=>{
        try{
          entries++;
          if(entries>MAX_ENTRIES)throw new Error('Signature ZIP has too many entries');
          const path=strip(entry.fileName);
          if(seen.has(path))throw new Error('Duplicate ZIP entry: '+path);
          seen.add(path);
          expanded+=entry.uncompressedSize;
          if(expanded>MAX_EXPANDED||entry.uncompressedSize>MAX_ENTRY)
            throw new Error('ZIP exceeds expanded file size safety limits');
          if(entry.fileName.endsWith('/')){zip.readEntry();return;}
          const isManifest=path==='ASSET_MANIFEST.json';
          const png=path.toLowerCase().endsWith('.png');
          if(png)pngs.add(path);
          const isAsset=png && Object.hasOwn(CATEGORIES,path.split('/')[0]);
          const frame=path.includes('/03_Individual_Frames/');
          const sheet=path.includes('/02_Animated_SpriteSheets/');
          if(!isManifest && (!isAsset || (mode==='essential'&&frame) || (mode==='frames'&&sheet))){
            zip.readEntry();return;
          }
          zip.openReadStream(entry,(readError,stream)=>{
            if(readError||!stream){fail(readError||new Error('Unable to read ZIP file'));return;}
            const chunks:Buffer[]=[];
            stream.on('data',(b:Buffer)=>chunks.push(b));
            stream.on('error',fail);
            stream.on('end',()=>{
              try{
                const data=Buffer.concat(chunks);
                if(isManifest)manifest=JSON.parse(data.toString('utf8'));
                else {
                  if(data.length<33 || data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' ||
                    ![4,6].includes(data[25]))throw new Error('Signature V1 asset must be transparent PNG: '+path);
                  if(sheet && (data.readUInt32BE(16)!==2048 || data.readUInt32BE(20)!==1024))
                    throw new Error('Expected 2048x1024 4x4 sprite sheet: '+path);
                  assets.push({effect:'',kind:'sig_main',path,data,
                    sha256:createHash('sha256').update(data).digest('hex')});
                }
                zip.readEntry();
              }catch(e){fail(e as Error);}
            });
          });
        }catch(e){fail(e as Error);}
      });
      zip.on('end',()=>{
        try{
          const expected=expectedFromManifest(manifest);
          for(const path of pngs)if(!expected.has(path))
            throw new Error('Unknown PNG in Name Signature pack: '+path);
          if(pngs.size!==108 && pngs.size!==876)
            throw new Error('Name Signature ZIP must be either Essential 108 or Full 876 PNGs');
          const required=[...expected.entries()].filter(([,a])=>chosen(a.kind,mode));
          const included=new Set<string>();
          for(const asset of assets){
            const ref=expected.get(asset.path);
            if(!ref || !chosen(ref.kind,mode) || asset.sha256!==ref.sha256)
              throw new Error('Missing, mismatched, or modified Signature PNG: '+asset.path);
            asset.effect=ref.name;
            asset.kind=('sig_'+ref.kind.toLowerCase()) as ScannedAsset['kind'];
            included.add(asset.path);
          }
          if(included.size!==required.length || required.some(([path])=>!included.has(path)))
            throw new Error('Selected mode requires more PNGs. Choose Essential for the 108 ZIP or upload the Full 876 ZIP for Frames/All.');
          const counts:Record<string,number>={};
          for(const a of assets){
            const cat=a.path.split('/')[0];
            counts[cat]=(counts[cat]||0)+1;
          }
          if(!settled){settled=true;resolve({manifest,assets,counts,allPngCount:pngs.size,packType:'signature_v1'});}
        }catch(e){fail(e as Error);}
      });
      zip.readEntry();
    });
  });
}
