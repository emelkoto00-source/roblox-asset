'use client';
import { useCallback,useEffect,useRef,useState,type ChangeEvent,type DragEvent } from 'react';

type View='upload'|'migration';
type Owner='user'|'group';
type Selected={key:string;file:File;url:string};
type RecordItem={id:string;batchId:string;name:string;path:string;sourceId:string|null;status:string;robloxId:string|null;error:string|null;owner:Owner;createdAt:string;batchStatus:string};
type AssetDetail={batch:{id:string;filename:string;status:string;owner_type:Owner;owner_id:string};counts:Record<string,number>;total:number;assets:{id:string;rel_path:string;status:string;asset_id:string|null;error_text:string|null}[]};
type History={assets:RecordItem[];batches:{id:string;count:number;created:number;pending:number;failed:number;workflow:View;owner:Owner;sourceId:string|null;createdAt:string}[]};
const fmt=(n:number)=>n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB';
const maxFiles=30;
function statusName(value:string){
  if(value==='created')return 'Created · review unverified';
  if(value==='needs_review')return 'Needs attention';
  if(value==='processing'||value==='submitting'||value==='queued')return 'Processing';
  if(value==='staged')return 'Staged';
  if(value==='failed')return 'Failed';
  return value;
}
export default function Dashboard(){
  const [tab,setTab]=useState<View>('upload');
  const [owner,setOwner]=useState<Owner>('user');
  const [selected,setSelected]=useState<Selected[]>([]);
  const [sourceFile,setSourceFile]=useState<Selected|null>(null);
  const [sourceId,setSourceId]=useState('');
  const [rights,setRights]=useState('owned');
  const [confirmed,setConfirmed]=useState(false);
  const [active,setActive]=useState<string|null>(null);
  const [detail,setDetail]=useState<AssetDetail|null>(null);
  const [history,setHistory]=useState<History>({assets:[],batches:[]});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [drag,setDrag]=useState(false);
  const fileInput=useRef<HTMLInputElement|null>(null);
  const migrationInput=useRef<HTMLInputElement|null>(null);
  const refresh=useCallback(async()=>{
    try{
      const res=await fetch('/api/manual',{cache:'no-store'});
      if(res.ok)setHistory(await res.json());
    }catch{}
  },[]);
  const refreshActive=useCallback(async(id:string)=>{
    try{const res=await fetch('/api/batches/'+id,{cache:'no-store'});if(res.ok)setDetail(await res.json());}catch{}
  },[]);
  useEffect(()=>{refresh();},[refresh]);
  useEffect(()=>{if(!active)return;refreshActive(active);},[active,refreshActive]);
  useEffect(()=>{const timer=setInterval(()=>{refresh();if(active)refreshActive(active);},5000);return()=>clearInterval(timer)},[active,refresh,refreshActive]);
  useEffect(()=>()=>{selected.forEach(s=>URL.revokeObjectURL(s.url));},[selected]);
  useEffect(()=>()=>{if(sourceFile)URL.revokeObjectURL(sourceFile.url);},[sourceFile]);

  function addFiles(incoming:FileList|File[]){
    const raw=Array.from(incoming);
    const ok=raw.filter(f=>['image/png','image/jpeg','image/webp'].includes(f.type));
    if(ok.length!==raw.length){setError('Only PNG, JPG, or WebP image files are accepted.');return;}
    if(selected.length+ok.length>maxFiles){setError('Select no more than 30 images per batch.');return;}
    if(ok.some(f=>f.size===0||f.size>8_000_000)){setError('Each image must be nonempty and 8 MB or smaller.');return;}
    const next=ok.map(file=>({key:crypto.randomUUID(),file,url:URL.createObjectURL(file)}));
    setSelected(previous=>[...previous,...next]);
    setError('');setMessage('');
  }
  function chooseMigration(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    if(file){
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>8_000_000){
        setError('Select a PNG, JPG or WebP image under 8 MB.');return;
      }
      setSourceFile({key:crypto.randomUUID(),file,url:URL.createObjectURL(file)});
      setError('');
    }
    e.target.value='';
  }
  function onDrop(e:DragEvent<HTMLDivElement>){
    e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files);
  }
  async function stage(){
    const files=tab==='upload'?selected.map(s=>s.file):sourceFile?[sourceFile.file]:[];
    if(!files.length){setError('Select an image first.');return;}
    if(!confirmed){setError('Confirm that you own or are authorized to publish the images.');return;}
    if(tab==='migration'&&(!/^[0-9]{1,20}$/.test(sourceId)||rights==='none')){
      setError('Enter a numeric asset ID and confirm ownership or republishing permission.');return;
    }
    setBusy(true);setError('');setMessage('');
    try{
      const form=new FormData();form.set('workflow',tab);form.set('owner',owner);
      form.set('sourceId',sourceId.trim());form.set('rights',rights);form.set('confirmed','true');
      files.forEach(file=>form.append('files',file,file.name));
      const res=await fetch('/api/manual',{method:'POST',body:form});
      const data=await res.json();if(!res.ok)throw Error(data.error||'Unable to stage images');
      setActive(data.id);await Promise.all([refresh(),refreshActive(data.id)]);
      setMessage(data.count+' image'+(data.count===1?'':'s')+' staged successfully. Nothing has been sent to Roblox yet. Review the publishing controls.');
      setConfirmed(false);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false);}
  }
  async function publish(mode:'test'|'start'){
    if(!active)return;
    if(!window.confirm(mode==='test'?'Submit one test image to Roblox under the selected owner?':'Submit the remaining staged images to Roblox? This creates assets under the selected owner.'))return;
    setBusy(true);setError('');
    try{
      const res=await fetch('/api/batches/'+active+'/'+mode,{method:'POST'});
      const data=await res.json();
      if(!res.ok)throw Error(data.error||'Roblox publishing could not start');
      setMessage(mode==='test'?'One test image has been queued. Check its result before publishing the rest.':String(data.count)+' images were queued for Roblox creation.');
      await Promise.all([refresh(),refreshActive(active)]);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false);}
  }
  const created=detail?.counts.created||0,total=detail?.total||0;
  const progress=total?Math.round(100*created/total):0;
  const isStaged=detail?.assets?.some(a=>a.status==='staged')??false;
  const sample=history.assets.filter(a=>tab==='migration'?!!a.sourceId:!a.sourceId);
  const totalCreated=history.assets.filter(a=>a.status==='created').length;
  const totalProcessing=history.assets.filter(a=>['processing','queued','submitting','staged'].includes(a.status)).length;
  const totalAttention=history.assets.filter(a=>['failed','needs_review'].includes(a.status)).length;
  const formatDate=(iso:string)=>new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

  return <div className="ma-shell">
    <aside className="ma-side">
      <div className="ma-brand"><span className="ma-logo">✧</span><div>EST <strong>ASSET CLOUD</strong><small>ROBLOX CREATOR TOOLS</small></div></div>
      <div className="ma-side-label">WORKSPACE</div>
      <button className={'ma-side-link '+(tab==='upload'?'ma-selected':'')} onClick={()=>setTab('upload')}>▣ <span>Bulk Image Upload</span></button>
      <button className={'ma-side-link '+(tab==='migration'?'ma-selected':'')} onClick={()=>setTab('migration')}>⇄ <span>Asset ID Migration</span></button>
      <div className="ma-side-label ma-side-gap">LIBRARY</div>
      <button className="ma-side-link" onClick={()=>document.getElementById('asset-history')?.scrollIntoView({behavior:'smooth'})}>◈ <span>Asset Registry</span></button>
      <button className="ma-side-link" onClick={()=>{refresh();if(active)refreshActive(active)}}>◷ <span>Refresh Status</span></button>
      <div className="ma-workspace"><span className="ma-live-dot"/> <b>Private creator workspace</b><small>Roblox Open Cloud · API keys server-side</small></div>
      <form action="/api/auth/logout" method="post" className="ma-logout"><button type="submit">Sign out ↗</button></form>
    </aside>
    <main className="ma-main">
      <div className="ma-mast"><span>EST CREATOR TOOLS / ASSET MANAGEMENT</span><span className="ma-private">✦ PRIVATE DASHBOARD</span></div>
      <div className="ma-head"><div><div className="ma-eyebrow">YOUR ROBLOX ASSET WORKSPACE</div><h1>Asset management, <em>made simple.</em></h1><p>Upload custom images, publish under your Roblox creator, and organize every generated asset ID in one place.</p></div><span className="ma-cube">✦</span></div>
      <div className="ma-tabs" role="tablist" aria-label="Asset workflows">
        <button role="tab" aria-selected={tab==='upload'} className={tab==='upload'?'active':''} onClick={()=>{setTab('upload');setError('');}}>▣ &nbsp; Bulk Image Upload</button>
        <button role="tab" aria-selected={tab==='migration'} className={tab==='migration'?'active':''} onClick={()=>{setTab('migration');setError('');}}>⇄ &nbsp; Asset ID Migration</button>
      </div>
      <div className="ma-metrics">
        <div><small>IMAGES TRACKED</small><strong>{history.assets.length}</strong><span>Latest 200 manual records</span></div>
        <div><small>ROBLOX IDS CREATED</small><strong>{totalCreated}</strong><span>Moderation not verified</span></div>
        <div><small>IN QUEUE / STAGED</small><strong>{totalProcessing}</strong><span>Includes pending submissions</span></div>
        <div><small>NEEDS ATTENTION</small><strong>{totalAttention}</strong><span>Review failed submissions</span></div>
      </div>
      {tab==='upload'?<div className="ma-grid">
        <section className="ma-panel"><div className="ma-panel-head"><div><h2>Upload your images</h2><p>Select several files and review them before publishing.</p></div><span className="ma-count">{selected.length} / 30</span></div>
          <div className={'ma-drop '+(drag?'ma-drag':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={()=>fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')fileInput.current?.click()}}>
            <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e=>{if(e.target.files)addFiles(e.target.files);e.target.value=''}}/>
            <div className="ma-drop-icon">⇧</div><strong>Drag & drop your images here</strong><p>or click to browse your device</p><span>PNG · JPG · WEBP &nbsp; / &nbsp; up to 30 files, 8 MB each</span>
          </div>
          <div className="ma-files-head"><strong>Selected images ({selected.length})</strong><button onClick={()=>setSelected([])} disabled={!selected.length} className="ma-plain">Clear all</button></div>
          <div className="ma-files">{selected.length?selected.map(x=><div key={x.key} className="ma-file">
            <img src={x.url} alt={'Preview of '+x.file.name}/><div className="ma-file-info"><b title={x.file.name}>{x.file.name}</b><small>{fmt(x.file.size)} · ready to stage</small></div><span className="ma-ready">READY</span>
            <button aria-label={'Remove '+x.file.name} onClick={()=>setSelected(list=>list.filter(y=>y.key!==x.key))}>×</button>
          </div>):<div className="ma-empty-small">No images selected yet. Add photos above to get started.</div>}</div>
        </section>
        <div className="ma-right"><section className="ma-panel"><div className="ma-panel-head"><div><h2>Publishing settings</h2><p>Choose where your assets will be created.</p></div><span className="ma-chip">OPEN CLOUD</span></div>
          {ownerPicker(owner,setOwner)}
          <div className="ma-label">ASSET TYPE</div><div className="ma-field">Decal / image asset <span>▾</span></div>
          <div className="ma-info">ⓘ &nbsp; Uploaded images are converted to PNG. Roblox creates an asset ID; approval and visibility depend on Roblox moderation.</div>
          <label className="ma-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I own these images or have permission to publish them.</label>
          <button className="ma-cta" disabled={busy||!selected.length} onClick={stage}>{busy?'Processing images…':'Stage '+selected.length+' image'+(selected.length===1?'':'s')+' for Roblox'} &nbsp; →</button>
          <p className="ma-fine">Staging is safe. Publishing requires a separate confirmation.</p>
        </section>{publishPanel(active,detail,progress,total,created,isStaged,busy,publish)}</div>
      </div>:<div className="ma-grid">
        <section className="ma-panel">
          <div className="ma-migration-hero"><span>⇄</span><div><strong>Move authorized images into your library</strong><p>Republish your original image under your chosen creator and keep an old-to-new ID mapping.</p></div></div>
          <div className="ma-panel-head"><div><h2>Asset ID Migration</h2><p>For images you own or are authorized to republish.</p></div><span className="ma-chip">IMAGE ONLY</span></div>
          <label className="ma-label" htmlFor="source-id">ORIGINAL ROBLOX ASSET ID</label><input className="ma-input" id="source-id" inputMode="numeric" placeholder="Paste the original Roblox asset ID" value={sourceId} onChange={e=>setSourceId(e.target.value.replace(/\s/g,''))}/>
          <label className="ma-label" htmlFor="rights">REPUBLISHING RIGHTS</label><select className="ma-input" id="rights" value={rights} onChange={e=>setRights(e.target.value)}><option value="owned">I own this asset</option><option value="licensed">I have permission to republish it</option><option value="none">I do not have permission</option></select>
          <div className="ma-label">ORIGINAL AUTHORIZED IMAGE FILE</div><input ref={migrationInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseMigration}/>
          <button className="ma-file-picker" onClick={()=>migrationInput.current?.click()}>{sourceFile?'✓ '+sourceFile.file.name:'⇧ Choose PNG, JPG, or WebP source file'}</button>
          {sourceFile&&<div className="ma-source-preview"><img src={sourceFile.url} alt="Authorized source image preview"/><small>{fmt(sourceFile.file.size)}</small><button onClick={()=>setSourceFile(null)}>Remove</button></div>}
          <div className="ma-info">ⓘ &nbsp; Pasting an asset ID alone does not grant access to its data. This workflow uses your original authorized image and records the old → new ID. It cannot extract restricted third-party animations or audio.</div>
          <label className="ma-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm I have rights to republish this image.</label>
          <button className="ma-cta" disabled={busy||!sourceFile||rights==='none'||!sourceId} onClick={stage}>{busy?'Preparing migration…':'Stage authorized migration'} &nbsp; →</button>
        </section>
        <div className="ma-right">
          <section className="ma-panel"><div className="ma-panel-head"><div><h2>Migration workflow</h2><p>Original source first, new ID second.</p></div><span className="ma-chip">4 STEPS</span></div>
            <div className="ma-steps"><div><b>01</b><span><strong>Enter source ID</strong><small>Record which asset you're replacing</small></span></div><div><b>02</b><span><strong>Supply permitted image</strong><small>Original file + republishing rights</small></span></div><div><b>03</b><span><strong>Publish under your creator</strong><small>Roblox creates a separate asset ID</small></span></div><div><b>04</b><span><strong>Export the mapping</strong><small>Replace IDs in your game where authorized</small></span></div></div>
          </section>{publishPanel(active,detail,progress,total,created,isStaged,busy,publish)}
        </div>
      </div>}
      {(error||message)&&<div role="status" className={'ma-alert '+(error?'bad':'good')}>{error||message}</div>}
      <section className="ma-panel ma-history" id="asset-history"><div className="ma-panel-head"><div><h2>{tab==='migration'?'Authorized ID mapping history':'Asset Registry'}</h2><p>Actual Roblox create results from your account; never sample IDs.</p></div><div className="ma-actions"><button className="ma-secondary" onClick={refresh}>↻ Refresh</button>{active&&<a className="ma-secondary" href={'/api/batches/'+active+'/export?format=csv'}>↓ Export batch CSV</a>}</div></div>
        <div className="ma-table-scroll"><table><thead><tr><th>ASSET / SOURCE</th><th>ROBLOX ASSET ID</th><th>STATUS</th><th>OWNER</th><th></th></tr></thead><tbody>
          {sample.slice(0,100).map(a=><tr key={a.id}><td><b>{a.name}.png</b>{a.sourceId&&<small>Original: {a.sourceId}</small>}<small>{formatDate(a.createdAt)}</small></td>
            <td className="ma-id">{a.robloxId||'—'}</td><td><span className={'ma-status '+(a.status==='created'?'created':['failed','needs_review'].includes(a.status)?'failed':'waiting')}>{statusName(a.status)}</span>{a.error&&<small title={a.error}>{a.error.slice(0,90)}</small>}</td>
            <td>{a.owner==='group'?'Group':'Personal'}</td><td>{a.robloxId&&<button className="ma-secondary" onClick={()=>navigator.clipboard.writeText(a.robloxId!)}>Copy ID</button>}</td></tr>)}
          {!sample.length&&<tr><td colSpan={5} className="ma-no-records">No records yet in this view. Stage and publish an image to generate a new asset ID.</td></tr>}
        </tbody></table></div><p className="ma-fine">Created means Roblox returned an ID. Moderation approval is not verified by this dashboard.</p>
      </section>
      <footer className="ma-footer">EST Asset Cloud · Personal & group asset management · Official Roblox Open Cloud · No permission bypass</footer>
    </main>
  </div>;
}

function ownerPicker(owner:Owner,onChange:(owner:Owner)=>void){
  return <><div className="ma-label">DESTINATION OWNER</div><div className="ma-owners">
    <button className={owner==='user'?'on':''} onClick={()=>onChange('user')}>◉ &nbsp; Personal creator<small>Your Roblox account</small></button>
    <button className={owner==='group'?'on':''} onClick={()=>onChange('group')}>⬡ &nbsp; Roblox group<small>Authorized group owner</small></button>
  </div></>;
}
function publishPanel(active:string|null,detail:AssetDetail|null,progress:number,total:number,created:number,isStaged:boolean,busy:boolean,publish:(m:'test'|'start')=>void){
  return <section className="ma-panel"><div className="ma-panel-head"><div><h2>Publishing control</h2><p>Confirm uploads and track their progress.</p></div><span className="ma-chip">LIVE STATUS</span></div>
    {active&&detail?<><div className="ma-progress-head"><strong>{created} / {total} created</strong><span>{progress}%</span></div><div className="ma-progress"><div style={{width:progress+'%'}}/></div>
      <div className="ma-progress-stats"><span>Staged: {detail.counts.staged||0}</span><span>Processing: {(detail.counts.queued||0)+(detail.counts.submitting||0)+(detail.counts.processing||0)}</span><span>Errors: {(detail.counts.failed||0)+(detail.counts.needs_review||0)}</span></div>
      <p className="ma-fine">Destination: {detail.batch.owner_type==='group'?'Group':'Personal'} · {detail.batch.owner_id}</p>
      {isStaged&&<div className="ma-publish-buttons"><button className="ma-secondary" disabled={busy} onClick={()=>publish('test')}>Test one image first</button><button className="ma-cta" disabled={busy} onClick={()=>publish('start')}>Confirm & publish remaining &nbsp; →</button></div>}
      <div className="ma-actions"><a className="ma-secondary" href={'/api/batches/'+active+'/export?format=luau'}>Luau</a><a className="ma-secondary" href={'/api/batches/'+active+'/export?format=json'}>JSON</a><a className="ma-secondary" href={'/api/batches/'+active+'/export?format=csv'}>CSV</a></div>
      </>:<div className="ma-control-empty">✧<strong>No active batch</strong><span>Choose your files and stage them. Your publishing options will appear here.</span></div>}
  </section>;
}
