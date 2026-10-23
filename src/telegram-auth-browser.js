/** Browser-only MTProto account access through the supported @mtcute/web package.
 * mtcute stores its authorization key in IndexedDB. We encrypt only the api_id/api_hash
 * configuration behind a local passphrase; neither is ever uploaded to OneDrive.
 */
const CREDENTIALS='viral-telegram-mtcute-settings-v1',DB='viral-scanner-telegram-mtcute-v1';
let activeClient=null;
export const connected=()=>Boolean(activeClient);
export const hasSavedSession=()=>{try{return !!localStorage.getItem(CREDENTIALS);}catch{return false;}};
function encode(bytes){let output='';for(const b of new Uint8Array(bytes))output+=String.fromCharCode(b);return btoa(output);}
function decode(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function key(passphrase,salt){const seed=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},seed,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function encryptCredentials(values,passphrase){if(String(passphrase).length<12)throw Error('Use a local passphrase of at least 12 characters.');const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const cryptoKey=await key(passphrase,salt);const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,new TextEncoder().encode(JSON.stringify(values)));return JSON.stringify({v:2,salt:encode(salt),iv:encode(iv),data:encode(sealed)});}
export async function decryptCredentials(blob,passphrase){try{const record=JSON.parse(blob);if(record.v!==2)throw Error('Invalid format');const cryptoKey=await key(passphrase,decode(record.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(record.iv)},cryptoKey,decode(record.data));const values=JSON.parse(new TextDecoder().decode(plain));if(!values.apiId||!values.apiHash)throw Error('Missing fields');return values;}catch{throw Error('Invalid passphrase or corrupted Telegram settings.');}}
export function client(){if(!activeClient)throw Error('Connect Telegram in the Connections tab first.');return activeClient;}
async function library(){try{return await import('./vendor/mtcute-client.js');}catch(e){throw Error('Telegram MTProto browser bundle is missing. Run PREPARE-TELEGRAM.cmd on Windows and upload mobile/dist. '+String(e?.message||e).slice(0,100));}}
export async function connect({apiId,apiHash,phone,passphrase,requestInput=async(label)=>window.prompt(label)||''}){
 if(activeClient)return {connected:true,already:true};
 const existing=hasSavedSession()?await decryptCredentials(localStorage.getItem(CREDENTIALS),passphrase):null;
 const id=Number(existing?.apiId??apiId),hash=String(existing?.apiHash??apiHash??'').trim(),number=String(existing?.phone||phone||'').trim();
 if(!Number.isInteger(id)||id<1||!/^[a-f\d]{32}$/i.test(hash))throw Error('Enter Telegram api_id and 32-character api_hash from my.telegram.org.');
 if(!existing&&!/^\+\d{8,15}$/.test(number))throw Error('Enter a phone number in international format.');
 if(String(passphrase).length<12)throw Error('Local passphrase must have at least 12 characters.');
 const {TelegramClient}=await library();const tg=new TelegramClient({apiId:id,apiHash:hash,storage:DB});
 try{
  const me=await tg.start({phone:async()=>number,
   code:async()=>{const code=String(await requestInput('Telegram verification code',false)).trim();if(!/^\d{4,10}$/.test(code))throw Error('Invalid Telegram verification code.');return code;},
   password:async()=>String(await requestInput('Telegram two-step verification password',true))});
  if(!me)throw Error('Telegram authorization did not complete.');
  if(!existing)localStorage.setItem(CREDENTIALS,await encryptCredentials({apiId:id,apiHash:hash,phone:number},passphrase));
  activeClient=tg;
  return {connected:true,accountName:String(me.displayName||me.firstName||me.username||'Telegram user').slice(0,80)};
 }catch(e){try{await tg.disconnect();await tg.destroy();}catch{}throw e;}
}
export async function disconnect({forget=false}={}){
 const old=activeClient;activeClient=null;
 if(old){try{if(forget)await old.logOut();else await old.disconnect();await old.destroy();}catch{}}
 if(forget){localStorage.removeItem(CREDENTIALS);if(typeof indexedDB!=='undefined')try{indexedDB.deleteDatabase(DB);}catch{}}
}
