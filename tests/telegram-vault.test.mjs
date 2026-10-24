import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from '../src/telegram-auth-browser.js';
const data=new Map(),session='TEST-SESSION-'+('x'.repeat(150)),pw='long-unique-passphrase-123456',hash='abcdef0123456789abcdef0123456789';
globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
globalThis.indexedDB={deleteDatabase:()=>{const req={};queueMicrotask(()=>req.onsuccess?.());return req;}};
class MemoryStorage{}
class TelegramClient{
 constructor(opts){assert.ok(opts.storage instanceof MemoryStorage);}
 async start(o){if(o.session)assert.equal(o.session,session);else assert.equal(await o.code(),'12345');return {firstName:'Test'};}
 async exportSession(){return session;}
 async logOut(){}
 async destroy(){}
}
const implementation={TelegramClient,MemoryStorage};
test('encrypts exported mtcute session at rest and resumes after lock',async()=>{
 await mod.connect({apiId:123456,apiHash:hash,phone:'+31612345678',passphrase:pw,requestInput:async()=> '12345',implementation});
 const raw=data.get('viral-telegram-mtcute-vault-v3');
 assert.ok(raw&&!raw.includes(session)&&!raw.includes(hash)&&!raw.includes(pw));
 await mod.disconnect();
 await assert.rejects(mod.connect({passphrase:'wrong-long-passphrase',implementation}),/Wrong passphrase/);
 await mod.connect({passphrase:pw,implementation});
 assert.equal(mod.connected(),true);
 await mod.disconnect({forget:true});
 assert.equal(data.has('viral-telegram-mtcute-vault-v3'),false);
});
test('tampered ciphertext fails closed',async()=>{
 await mod.connect({apiId:123456,apiHash:hash,phone:'+31612345678',passphrase:pw,requestInput:async()=> '12345',implementation});
 await mod.disconnect();
 const key='viral-telegram-mtcute-vault-v3',v=JSON.parse(data.get(key));v.ciphertext=v.ciphertext.slice(0,-2)+'AA';data.set(key,JSON.stringify(v));
 await assert.rejects(mod.connect({passphrase:pw,implementation}),/Wrong passphrase/);
 data.delete(key);
});
