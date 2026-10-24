import yauzl from 'yauzl';
import { createHash } from 'node:crypto';

export type ScannedAsset = {
  effect: string; kind: 'particle'|'main'|'motif'|'burst_sheet'|'loop_sheet'|'burst_frame'|'loop_frame';
  path: string; data: Buffer; sha256: string;
};
export type ScanResult = { manifest: any; assets: ScannedAsset[]; counts: Record<string,number>; allPngCount: number; packType?: 'particle_v4'|'creative_v3' };
const MAX_ENTRIES = 900;
const MAX_UNCOMPRESSED = 120_000_000;
const MAX_SINGLE_FILE = 12_000_000;
function safePath(s: string) {
  if (!s || s.startsWith('/') || s.includes('\\') || s.split('/').some(x => x === '..' || x === '.')) throw new Error('Unsafe ZIP path');
  return s.replace(/^EST_V4_Cinematic_Particle_Asset_Pack\//, '');
}
function kindFor(rel: string): ScannedAsset['kind']|null {
  if (rel.includes('/01_Transparent_Particles/') && rel.endsWith('.png')) return 'particle';
  if (rel.includes('/02_Animated_SpriteSheets/') && rel.endsWith('.png')) {
    if (rel.includes('_BURST_')) return 'burst_sheet';
    if (rel.includes('_LOOP_')) return 'loop_sheet';
  }
  if (rel.includes('/03_Numbered_Animation_Frames/') && rel.endsWith('.png')) {
    if (rel.includes('_BURST_')) return 'burst_frame';
    if (rel.includes('_LOOP_')) return 'loop_frame';
  }
  return null;
}
export function selectedForMode(kind:ScannedAsset['kind'],mode:'essential'|'frames'|'all') {
  if (mode === 'all') return true;
  if (mode === 'essential') return ['particle','burst_sheet','loop_sheet'].includes(kind);
  return ['particle','burst_frame','loop_frame'].includes(kind);
}
export async function scanParticleZip(buffer: Buffer, mode:'essential'|'frames'|'all'): Promise<ScanResult> {
  return await new Promise((resolve,reject)=> {
    yauzl.fromBuffer(buffer,{lazyEntries:true,decodeStrings:true,validateEntrySizes:true}, (openError,zip)=> {
      if (openError || !zip) { reject(openError ?? new Error('Bad ZIP')); return; }
      let entries=0,totalBytes=0,allPngCount=0,manifest:any=null;
      const assets: ScannedAsset[]=[];
      const seen=new Set<string>();
      let settled=false;
      const fail=(e:Error)=>{if (!settled){settled=true; zip.close();reject(e)}};
      zip.on('error',fail);
      zip.on('entry',(entry)=>{
        try {
          entries++;
          if (entries>MAX_ENTRIES) throw new Error('Too many ZIP entries');
          const rel=safePath(entry.fileName);
          if (seen.has(rel)) throw new Error('Duplicate ZIP entry: '+rel);
          seen.add(rel);
          totalBytes+=entry.uncompressedSize;
          if (totalBytes>MAX_UNCOMPRESSED || entry.uncompressedSize>MAX_SINGLE_FILE) throw new Error('ZIP expands beyond limits');
          const isManifest=rel==='ASSET_MANIFEST.json';
          const kind=kindFor(rel);
          if (rel.toLowerCase().endsWith('.png')) allPngCount++;
          if (!isManifest && (!kind || !selectedForMode(kind,mode))) {zip.readEntry();return;}
          if (kind && !/^\d{2}_[\w]+\//.test(rel)) throw new Error('Unexpected asset path: '+rel);
          zip.openReadStream(entry,(streamError,stream)=>{
            if (streamError || !stream){fail(streamError || new Error('Unable to open ZIP entry'));return;}
            const chunks:Buffer[]=[];
            stream.on('data',(chunk:Buffer)=>chunks.push(chunk));
            stream.on('error',fail);
            stream.on('end',()=>{
              try {
                const data=Buffer.concat(chunks);
                if (isManifest) manifest=JSON.parse(data.toString('utf8'));
                else if (kind) {
                  if (data.length<33 || data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error('Not a PNG: '+rel);
                  if (![4,6].includes(data[25])) throw new Error('PNG must have alpha channel: '+rel);
                  const effectDir=rel.split('/')[0];
                  const effect=effectDir.replace(/^\d{2}_/,'').replaceAll('_',' ');
                  assets.push({effect,kind,path:rel,data,sha256:createHash('sha256').update(data).digest('hex')});
                }
                zip.readEntry();
              } catch(e){fail(e as Error)}
            });
          });
        } catch(e){fail(e as Error)}
      });
      zip.on('end',()=>{
        try {
          if (!manifest || manifest.pack!=='EST V4 Cinematic Particle Collection' || manifest.effects?.length!==15) throw new Error('Expected EST V4 manifest with 15 effects');
          const expected = new Map<string,string>(manifest.effects.map((x:any)=>[x.folder,x.effect]));
          for (const a of assets) {
            const dir=a.path.split('/')[0];
            if (!expected.has(dir) || expected.get(dir)!==a.effect) throw new Error('Unknown or mismatched effect: '+a.path);
          }
          const byEffect: Record<string,Record<string,number>>={};
          for (const e of manifest.effects) byEffect[e.effect]={particle:0,burst_sheet:0,loop_sheet:0,burst_frame:0,loop_frame:0};
          for (const a of assets) byEffect[a.effect][a.kind]++;
          for (const [effect,c] of Object.entries(byEffect)){
            if (c.particle!==8) throw new Error(effect+': expected eight particles');
            if (mode!=='frames' && (c.burst_sheet!==1 || c.loop_sheet!==1)) throw new Error(effect+': expected two sprite sheets');
            if (mode!=='essential' && (c.burst_frame!==16 || c.loop_frame!==16)) throw new Error(effect+': expected 16 burst and 16 loop frames');
          }
          const expectedCount = mode==='essential'?150:mode==='frames'?600:630;
          if (assets.length!==expectedCount || allPngCount!==630) throw new Error(`Asset count mismatch: ${assets.length}/${expectedCount}; PNGs found ${allPngCount}/630`);
          if (!settled){settled=true;resolve({manifest,assets,counts:Object.fromEntries(Object.entries(byEffect).map(([k,v])=>[k,Object.values(v).reduce((a,b)=>a+b,0)])),allPngCount})}
        } catch(e){fail(e as Error)}
      });
      zip.readEntry();
    });
  });
}
