import yauzl from 'yauzl';
import type { Selection } from './config';
import type { ScanResult } from './scanner';
import { scanParticleZip } from './scanner';
import { scanCreativeZip } from './creativeScanner';
import { scanSignatureZip, SIGNATURE_PACK } from './signatureScanner';

async function readPackName(buffer:Buffer):Promise<string> {
  return new Promise((resolve,reject)=>{
    yauzl.fromBuffer(buffer,{lazyEntries:true,decodeStrings:true,validateEntrySizes:true},(err,zip)=>{
      if(err||!zip){reject(err||new Error('Bad ZIP'));return;}
      let settled=false,entries=0;
      const fail=(e:Error)=>{if(!settled){settled=true;zip.close();reject(e);}};
      zip.on('error',fail);
      zip.on('entry',(entry)=>{
        entries++;if(entries>900){fail(new Error('Too many ZIP entries'));return;}
        const isManifest=entry.fileName==='ASSET_MANIFEST.json'||entry.fileName.endsWith('/ASSET_MANIFEST.json');
        if(!isManifest){zip.readEntry();return;}
        if(entry.uncompressedSize>1_000_000){fail(new Error('Oversized manifest'));return;}
        zip.openReadStream(entry,(readErr,stream)=>{
          if(readErr||!stream){fail(readErr||new Error('Cannot read manifest'));return;}
          const chunks:Buffer[]=[];
          stream.on('data',(b:Buffer)=>chunks.push(b));
          stream.on('error',fail);
          stream.on('end',()=>{
            try {
              const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if(!settled){settled=true;zip.close();resolve(parsed.pack);}
            }catch(e){fail(e as Error);}
          });
        });
      });
      zip.on('end',()=>fail(new Error('ZIP is missing ASSET_MANIFEST.json')));
      zip.readEntry();
    });
  });
}
export async function scanESTZip(buffer:Buffer,mode:Selection):Promise<ScanResult>{
  const name=await readPackName(buffer);
  if(name===SIGNATURE_PACK) return scanSignatureZip(buffer,mode);
  if(name==='EST Creative Name Accents + Level Identities V3') return scanCreativeZip(buffer,mode);
  if(name==='EST V4 Cinematic Particle Collection') {
    const result=await scanParticleZip(buffer,mode);
    return {...result,packType:'particle_v4'};
  }
  throw new Error('Unsupported asset collection. Choose Particle V4, Creative V3, or Name Signature V1 ZIP.');
}
