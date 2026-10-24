/** Telegram session vault: mtcute MemoryStorage + passphrase-encrypted exported session. */
const SLOT='viral-telegram-mtcute-vault-v3',OLD_SLOT='viral-telegram-mtcute-settings-v1',OLD_DB='viral-scanner-telegram-mtcute-v1';
const LABEL=new TextEncoder().encode('viral-scanner-telegram-vault:v3'),ROUNDS=310000;
let activeClient=null,activeKey=null,activeData=null;
export const connected=()=>!!activeClient;
export const hasSavedSession=()=>!!localStorage.getItem(SLOT);
const to64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(password,salt){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ROUNDS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function makeKey(passphrase){
 if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Local passphrase must have at least 12 characters.');
 const salt=crypto.getRandomValues(new Uint8Array(16));return {salt,key:await derive(passphrase,salt)};
}
async function seal(data,handle){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:LABEL},handle.key,new TextEncoder().encode(JSON.stringify(data)));
 return JSON.stringify({v:3,rounds:ROUNDS,salt:to64(handle.salt),iv:to64(iv),ciphertext:to64(bytes)});
}
async function unseal(raw,passphrase){
 if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Local passphrase must have at least 12 characters.');
 let obj;try{obj=JSON.parse(raw);}catch{throw Error('Corrupted stored Telegram session.');}
 if(obj?.v!==3||obj.rounds!==ROUNDS||typeof obj.salt!=='string'||typeof obj.iv!=='string'||typeof obj.ciphertext!=='string')throw Error('Unsupported stored Telegram session format.');
 try{
  const salt=from64(obj.salt),iv=from64(obj.iv),cipher=from64(obj.ciphertext);
  if(salt.length!==16||iv.length!==12||cipher.length<17||cipher.length>10000)throw Error('Corrupt vault.');
  const handle={salt,key:await derive(passphrase,salt)};
  const opened=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:LABEL},handle.key,cipher);
  const data=JSON.parse(new TextDecoder().decode(opened));
  if(!Number.isInteger(data?.apiId)||data.apiId<1||!/^[a-f0-9]{32}$/i.test(data.apiHash)||typeof data.session!=='string'||data.session.length<20||data.session.length>5000)throw Error('Invalid session record.');
  return {handle,data};
 }catch{throw Error('Wrong passphrase or corrupted Telegram session.');}
}
async function removeLegacy(){
 if(typeof indexedDB==='undefined')throw Error('IndexedDB unavailable; cannot erase unencrypted legacy session.');
 await new Promise((resolve,reject)=>{
  const request=indexedDB.deleteDatabase(OLD_DB);
  request.onsuccess=resolve;
  request.onerror=()=>reject(request.error||Error('Could not erase old Telegram session.'));
  request.onblocked=()=>reject(Error('Close other Viral Scanner tabs to remove the old unencrypted session.'));
 });
 localStorage.removeItem(OLD_SLOT);
}
async function library(){
 try{
  const m=await import('./vendor/mtcute-client.js');
  if(typeof m.TelegramClient!=='function'||typeof m.MemoryStorage!=='function')throw Error('Telegram bundle lacks MemoryStorage; rebuild with the updated entrypoint.');
  return m;
 }catch(e){throw Error('Secure Telegram browser bundle unavailable: '+String(e.message||e).slice(0,120));}
}
export function client(){if(!activeClient)throw Error('Connect Telegram in the Connections tab first.');return activeClient;}
export async function connect({apiId,apiHash,phone,passphrase,requestInput=async label=>window.prompt(label)||'',implementation}={}){
 if(activeClient)return {connected:true,already:true};
 const existing=localStorage.getItem(SLOT);
 let handle,data;
 if(existing)({handle,data}=await unseal(existing,passphrase));
 else {
  const id=Number(apiId),hash=String(apiHash||'').trim(),number=String(phone||'').trim();
  if(!Number.isInteger(id)||id<1||!/^[a-f0-9]{32}$/i.test(hash))throw Error('Enter Telegram api_id and valid api_hash.');
  if(!/^\+\d{8,15}$/.test(number))throw Error('Enter phone number with country code.');
  handle=await makeKey(passphrase);data={apiId:id,apiHash:hash,phone:number};
 }
 await removeLegacy();
 const {TelegramClient,MemoryStorage}=implementation||await library();
 if(typeof MemoryStorage!=='function'||typeof TelegramClient!=='function')throw Error('Secure Telegram client requires MemoryStorage.');
 const tg=new TelegramClient({apiId:data.apiId,apiHash:data.apiHash,storage:new MemoryStorage()});
 let newLogin=false;
 try{
  const me=existing?await tg.start({session:data.session,phone:async()=>{throw Error('Saved Telegram session expired. Revoke and sign in again.');}}):await tg.start({
   phone:async()=>data.phone,
   code:async()=>{const s=String(await requestInput('Telegram verification code',false)).trim();if(!/^\d{4,10}$/.test(s))throw Error('Invalid verification code.');return s;},
   password:async()=>String(await requestInput('Telegram two-step verification password',true)),
  });
  if(!me)throw Error('Telegram authorization did not complete.');
  newLogin=!existing;
  const session=await tg.exportSession();
  if(typeof session!=='string'||session.length<20||session.length>5000)throw Error('Telegram returned an invalid exported session.');
  data.session=session;
  localStorage.setItem(SLOT,await seal(data,handle));
  activeClient=tg;activeKey=handle;activeData=data;
  return {connected:true,accountName:String(me.displayName||me.firstName||me.username||'Telegram user').slice(0,80)};
 }catch(e){
  if(newLogin)try{await tg.logOut();}catch{}
  try{await tg.destroy();}catch{}
  throw e;
 }
}
export async function disconnect({forget=false}={}){
 const tg=activeClient,handle=activeKey,data=activeData;
 activeClient=null;activeKey=null;activeData=null;
 let revokeSucceeded=false,saveFailure=null;
 if(tg){
  if(forget){try{await tg.logOut();revokeSucceeded=true;}catch{}}
  else{
   try{
    const session=await tg.exportSession();
    if(typeof session!=='string'||session.length<20||session.length>5000)throw Error('Invalid Telegram session.');
    localStorage.setItem(SLOT,await seal({...data,session},handle));
   }catch(e){saveFailure=e;}
  }
  try{await tg.destroy();}catch{}
 }
 if(forget){localStorage.removeItem(SLOT);await removeLegacy();}
 if(saveFailure)throw Error('Unable to update encrypted session: '+saveFailure.message);
 return {revoked:revokeSucceeded,localRemoved:forget};
}
