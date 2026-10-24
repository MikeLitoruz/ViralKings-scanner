/** Local private run archive. Browsers persist records without a cloud account. */
const DATABASE='viral-scanner-local-runs-v1',STORE='runs',MAX_RUNS=100;
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DATABASE,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Cannot open browser database'));});}
async function withStore(mode,work){const db=await openDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);let result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);try{work(tx.objectStore(STORE),value=>result=value);}catch(e){reject(e);tx.abort();}});}finally{db.close();}}
export async function saveRun(run){if(!run?.id||!Array.isArray(run.results))throw Error('Invalid scan');return withStore('readwrite',(store)=>store.put(run));}
export async function loadRuns(){return withStore('readonly',(store,done)=>{const req=store.getAll();req.onsuccess=()=>done(req.result.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,MAX_RUNS));});}
