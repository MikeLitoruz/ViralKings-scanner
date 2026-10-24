import {discoverYoutube,safeName} from './youtube.js';
import * as drive from './onedrive.js';
import * as telegram from './telegram-auth-browser.js';
import {discoverTelegram} from './telegram-core.js';
import {saveRun,loadRuns} from './local-runs.js';
import {shareJson} from './share-json.js';
const $=(id)=>document.getElementById(id),state={profiles:[],youtube:null,telegramSources:[],rows:[],selected:new Set(),scanAbort:null};
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=String(text);return node;};
const status=(id,text)=>$(id).textContent=text;
function tab(name){for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===name);for(const p of document.querySelectorAll('.page'))p.classList.toggle('active',p.id==='page-'+name);if(name==='results')renderResults();if(name==='queue')renderQueue();}
function refreshConnected(){$('sync-state').textContent=drive.connected()?'OneDrive connected':'OneDrive offline';}
function resetSelected(){state.selected.clear();renderResults();}
function visibleRows(){const filter=$('filter').value.toLocaleLowerCase();return state.rows.filter(x=>`${x.Title||''} ${x.Profile||''} ${x.Platform||''}`.toLocaleLowerCase().includes(filter));}
function renderResults(){const box=$('results');box.replaceChildren();const rows=visibleRows();box.classList.toggle('empty',!rows.length);if(!rows.length)box.textContent='No matching videos. Search or refresh synchronized runs.';
 for(const row of rows.slice(0,500)){
   const key=row.Platform+':'+(row.VideoId||row.URL)+':'+(row.ProfileId||row.Profile);
   const wrap=el('article','result'),check=el('input');check.type='checkbox';check.checked=state.selected.has(key);check.setAttribute('aria-label','Select video '+row.Title);check.addEventListener('change',()=>{if(check.checked)state.selected.add(key);else state.selected.delete(key);updateSelected();});wrap.append(check);
   const image=el('img');image.loading='lazy';image.alt='Video thumbnail';if(/^https:\/\//.test(row.ThumbnailUrl||'')||/^data:image\/(jpeg|png|webp);base64,/.test(row.ThumbnailUrl||''))image.src=row.ThumbnailUrl;else image.alt='No thumbnail available';wrap.append(image);
   const d=el('div','desc'),title=el('a','title',row.Title||'Untitled video');if(/^https:\/\//.test(row.URL||'')){title.href=row.URL;title.target='_blank';title.rel='noopener noreferrer';}d.append(title);
   const meta=el('div','meta'),tag=el('span','tag',row.SuggestedPopularity&&row.SuggestedPopularity!=='NONE'?row.SuggestedPopularity:row.ResultStatus||'UNVERIFIED');meta.append(tag,document.createTextNode(`${row.Profile||''} · ${row.Platform||''} · ${Number(row.Views||0).toLocaleString()} views`));d.append(meta);wrap.append(d);box.append(wrap);
 }
 updateSelected();}
function updateSelected(){status('selected-count',`${state.selected.size} selected`);$('prepare').disabled=!state.selected.size;}
function chosenRows(){return state.rows.filter(r=>state.selected.has(r.Platform+':'+(r.VideoId||r.URL)+':'+(r.ProfileId||r.Profile)));}
function renderQueue(){const box=$('edit-list');box.replaceChildren();const selected=chosenRows();if(!selected.length)box.append(el('p','hint','Select videos under Results first.'));
 for(const [i,row] of selected.entries()){const card=el('div','list-item'),name=safeName(row.Title||row.VideoId);card.append(el('strong',null,`${i+1}. ${row.Title||'Video'}`));const inp=el('input');inp.type='text';inp.dataset.video=row.VideoId||String(i);inp.value=name;inp.disabled=!$('rename').checked;inp.setAttribute('aria-label','Filename for '+row.Title);card.append(inp);box.append(card);}
 $('save-jobs').disabled=!selected.length;}
async function saveBatch(){const chosen=chosenRows();if(!chosen.length)throw new Error('No videos selected.');if(chosen.length>30)throw new Error('Maximum 30 videos per batch.');const files=$('rename').checked?[...document.querySelectorAll('#edit-list input')].map(n=>n.value):chosen.map(row=>safeName(row.Title));const names=new Set();for(const n of files){if(!n||n.length>120||/[<>:"/\\|?*\x00-\x1F]/.test(n)||/[. ]$/.test(n)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(n))throw new Error('Invalid video name: '+n);if(names.has(n.toLocaleLowerCase()))throw new Error('Duplicate filename: '+n);names.add(n.toLocaleLowerCase());}
 const jobId=drive.recordId('job'),doc={schema:1,jobId,createdAt:new Date().toISOString(),origin:'mobile',items:chosen.map((r,i)=>({platform:String(r.Platform||'').toLowerCase(),videoId:String(r.VideoId||''),url:r.URL,profileId:r.ProfileId,title:r.Title,filename:files[i],row:{...r,SaveAsName:files[i]}}))};
 if(drive.connected()){const folders=await drive.ensureFolders();await drive.publishJson(folders.Queue,`${jobId}.json`,doc);status('queue-status',`Batch submitted: ${jobId}. Windows will process when OneDrive syncs and the bridge runs.`);}else{const result=await shareJson(`${jobId}.json`,doc);if(result==='cancelled'){status('queue-status','Sharing cancelled; the selected videos remain in the queue.');return;}status('queue-status',`Queue file ${result}. Save it in the OneDrive Queue folder monitored by your Windows worker.`);}state.selected.clear();renderQueue();}
function chosenProfiles(){const ids=new Set([...document.querySelectorAll('#profiles input[type=checkbox]:checked')].map(x=>x.value));return state.profiles.filter(p=>ids.has(p.id));}
function updateProfileCount(){status('profiles-count',`${chosenProfiles().length} of ${state.profiles.length} selected`);}
function renderProfileChoices(){const selected=new Set([...document.querySelectorAll('#profiles input[type=checkbox]:checked')].map(n=>n.value)),root=$('profiles');root.replaceChildren();for(const profile of state.profiles){const label=el('label','profile-choice'),check=el('input');check.type='checkbox';check.value=profile.id;check.checked=selected.has(profile.id);check.addEventListener('change',updateProfileCount);label.append(check,el('span',null,profile.name));root.append(label);}updateProfileCount();}
function replaceProfiles(profiles){state.profiles=profiles.filter(p=>p.enabled!==false);renderProfileChoices();}
async function search(){
 if(state.scanAbort)return;
 const platform=$('platform').value,profiles=chosenProfiles();
 if(!profiles.length)throw new Error('Select at least one profile.');
 if(!platform)throw new Error('Choose a search platform.');
 const controller=new AbortController();state.scanAbort=controller;$('scan').disabled=true;$('cancel').classList.remove('hidden');
 let completed=0,totalCandidates=0,failedProfiles=[];
 try{
  for(const profile of profiles){
   if(controller.signal.aborted)break;
   status('scan-status',`Profile ${completed+1}/${profiles.length}: ${profile.name} — starting ${platform} scan`);
   try{
    let rows=[],failures=[],searched=0;
    if(platform==='telegram'){
     const result=await discoverTelegram({client:telegram.client(),profile,sources:state.telegramSources,limitPerSource:Number($('telegram-limit').value),signal:controller.signal,onProgress:p=>status('scan-status',`${profile.name} (${completed+1}/${profiles.length}): ${p.completed}/${p.total} channels · ${p.candidates} videos · ${p.source}`)});
     rows=result.rows;failures=result.failures;searched=result.sourceCount;
    }else if(platform==='youtube'){
     rows=await discoverYoutube({key:$('youtube-key').value.trim(),profile,config:state.youtube,limit:Number($('query-count').value),signal:controller.signal,onProgress:p=>status('scan-status',`${profile.name} (${completed+1}/${profiles.length}): ${p.completed}/${p.total} queries · ${p.candidates} candidates`)});
     searched=Number($('query-count').value);
    }else throw new Error('Unsupported mobile provider.');
    // Keep each profile independently assessed and independently persisted.
    const id=drive.recordId('mobile'),run={schema:1,id,origin:'mobile',createdAt:new Date().toISOString(),profileId:profile.id,profileName:profile.name,platforms:[platform],status:'PROVISIONAL',queryCount:searched,sourceFailures:failures,results:rows};
    state.rows=[...rows,...state.rows.filter(x=>!rows.some(y=>x.VideoId===y.VideoId&&x.Platform===y.Platform&&x.ProfileId===y.ProfileId))];
    try{await saveRun(run);}catch(e){failedProfiles.push(`${profile.name} local save: ${e.message}`);}
    totalCandidates+=rows.length;completed++;
    if(drive.connected()){try{const f=await drive.ensureFolders();await drive.publishJson(f.Runs,`${id}.json`,run);}catch(e){failedProfiles.push(`${profile.name} sync: ${e.message}`);}}
   }catch(e){
    if(controller.signal.aborted||e?.name==='AbortError')break;
    failedProfiles.push(`${profile.name}: ${e.message||e}`);
    completed++;
   }
  }
  const message=`${controller.signal.aborted?'Cancelled. ':'Done. '}${completed}/${profiles.length} profiles processed · ${totalCandidates} candidates${failedProfiles.length?' · Issues: '+failedProfiles.join('; '):''}.${drive.connected()?'':' Results not synced; connect OneDrive.'}`;
  status('scan-status',message);tab('results');
  // The search page preserves the final summary when returning from Results.
 }finally{state.scanAbort=null;$('scan').disabled=false;$('cancel').classList.add('hidden');}
}
function telegramChallenge(label,secret=false){return new Promise(resolve=>{
 const area=$('telegram-challenge'),field=$('telegram-challenge-value'),submit=$('telegram-challenge-submit');
 $('telegram-challenge-label').textContent=label;field.type=secret?'password':'text';field.value='';area.classList.remove('hidden');
 const done=()=>{const value=field.value;field.value='';area.classList.add('hidden');submit.removeEventListener('click',done);field.removeEventListener('keydown',onKey);resolve(value);};
 const onKey=e=>{if(e.key==='Enter'){e.preventDefault();done();}};
 submit.addEventListener('click',done);field.addEventListener('keydown',onKey);field.focus();
 });}
function telegramConnectionState(){
 const saved=telegram.hasSavedSession(),online=telegram.connected();
 $('telegram-state').textContent=online?'Telegram connected. Your authorized channel history is available for mobile search.':saved?'Encrypted Telegram session saved. Enter your passphrase to unlock.':'Telegram not yet connected. Create an api_id and api_hash at my.telegram.org, then authorize once.';
 $('telegram-new-fields').classList.toggle('hidden',saved);
 $('connect-tg').textContent=saved?'Unlock Telegram':'Connect Telegram';
}
async function connectTelegramMobile(){
 const result=await telegram.connect({apiId:$('telegram-api-id').value,apiHash:$('telegram-api-hash').value,phone:$('telegram-phone').value,passphrase:$('telegram-passphrase').value,requestInput:telegramChallenge});
 $('telegram-api-hash').value='';$('telegram-phone').value='';$('telegram-passphrase').value='';
 telegramConnectionState();status('scan-status',`Telegram connected${result.accountName?' as '+result.accountName:''}. Ready for channel discovery.`);
}
async function syncRuns(){if(!drive.connected())throw new Error('OneDrive is not connected.');const shared=await drive.fetchSharedProfiles();if(shared){if(Array.isArray(shared.telegramSources))state.telegramSources=shared.telegramSources;replaceProfiles(shared.profiles);}const runs=await drive.fetchRuns();for(const run of runs)try{await saveRun(run);}catch{}const values=runs.flatMap(r=>r.results).filter(v=>v?.VideoId&&v?.Title&&v?.Platform);const keys=new Set();state.rows=[...state.rows,...values].filter(x=>{const k=`${x.Platform}:${x.VideoId}:${x.ProfileId||x.Profile}`;if(keys.has(k))return false;keys.add(k);return true;});renderResults();status('scan-status',`Loaded ${runs.length} run files from OneDrive`);}
async function showStatuses(){if(!drive.connected())throw new Error('Connect OneDrive first.');const x=await drive.fetchStatuses(),root=$('statuses');root.replaceChildren();for(const j of x.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,30)){const item=el('div','list-item');item.append(el('strong',null,`${j.status||'UNKNOWN'} · ${j.jobId}`));item.append(el('div','meta',`${j.completed||0}/${j.total||0} videos · ${j.message||''}`));root.append(item);}if(!x.length)root.append(el('p','hint','No synchronized jobs yet.'));}
function bind(id,event,fn){$(id).addEventListener(event,async()=>{try{await fn();refreshConnected();}catch(e){const dest=['save-jobs','refresh-status'].includes(id)?'queue-status':'scan-status';status(dest,`Error: ${e.message||e}`);console.error(e);}});}
async function main(){const [profiles,youtube,telegramConfig]=await Promise.all([fetch('shared/profiles.json').then(x=>x.json()),fetch('shared/youtube.json').then(x=>x.json()),fetch('shared/telegram-sources.json').then(x=>x.json())]);state.youtube=youtube;state.telegramSources=telegramConfig.sources||[];replaceProfiles(profiles.profiles);try{const runs=await loadRuns();const seen=new Set();state.rows=runs.flatMap(r=>r.results).filter(r=>{const key=`${r.Platform}:${r.VideoId}:${r.ProfileId}`;if(seen.has(key))return false;seen.add(key);return true;});}catch(e){status('scan-status','Local scan archive unavailable: '+e.message);}
 $('client-id').value=drive.configuredClient();try{const success=await drive.finishLogin();if(success){status('scan-status','OneDrive signed in. You may search and synchronize runs.');try{const shared=await drive.fetchSharedProfiles();if(shared){if(Array.isArray(shared.telegramSources))state.telegramSources=shared.telegramSources;replaceProfiles(shared.profiles);}}catch(e){status('scan-status','Connected, but profiles sync failed: '+e.message);}}}catch(e){status('scan-status','Microsoft sign-in error: '+e.message);}refreshConnected();telegramConnectionState();
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));bind('scan','click',search);$('profiles-all').addEventListener('click',()=>{document.querySelectorAll('#profiles input').forEach(c=>c.checked=true);updateProfileCount();});$('profiles-none').addEventListener('click',()=>{document.querySelectorAll('#profiles input').forEach(c=>c.checked=false);updateProfileCount();});$('platform').addEventListener('change',()=>{$('telegram-scan-options').classList.toggle('hidden',$('platform').value!=='telegram');$('youtube-scan-options').classList.toggle('hidden',$('platform').value!=='youtube');});bind('connect-tg','click',connectTelegramMobile);bind('disconnect-tg','click',async()=>{await telegram.disconnect();telegramConnectionState();});bind('forget-tg','click',async()=>{if(!confirm('Log out from Telegram and erase the encrypted session on this device?'))return;await telegram.disconnect({forget:true});telegramConnectionState();});$('cancel').addEventListener('click',()=>state.scanAbort?.abort());bind('sync-runs','click',syncRuns);$('filter').addEventListener('input',renderResults);$('select-all').addEventListener('click',()=>{for(const row of visibleRows()){state.selected.add(row.Platform+':'+(row.VideoId||row.URL)+':'+(row.ProfileId||row.Profile));}renderResults();});$('clear-selected').addEventListener('click',resetSelected);$('prepare').addEventListener('click',()=>{renderQueue();tab('queue');});$('rename').addEventListener('change',renderQueue);$('reset-names').addEventListener('click',()=>{for(const [i,n] of [...document.querySelectorAll('#edit-list input')].entries())n.value=safeName(chosenRows()[i]?.Title);});bind('save-jobs','click',saveBatch);bind('refresh-status','click',showStatuses);bind('save-client','click',()=>{drive.setClient($('client-id').value);status('scan-status','Microsoft client ID stored on this device.');});bind('connect-ms','click',drive.login);$('disconnect-ms').addEventListener('click',()=>{drive.disconnect();refreshConnected();});if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
main().catch(e=>status('scan-status','Initialization failed: '+e.message));
