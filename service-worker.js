const CACHE='viral-mobile-caption-preview-v7';
const STATIC=['./','./index.html','./mobile.css','./src/app.js','./src/telegram-core.js','./src/telegram-auth-browser.js','./src/youtube.js','./src/onedrive.js','./src/local-runs.js','./src/share-json.js','./shared/profile-intelligence.mjs','./shared/ranking-contract.mjs','./shared/profiles.json','./shared/youtube.json','./shared/telegram-sources.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok&&response.type==='basic'&&!url.pathname.endsWith('.html')){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone)).catch(()=>{});}
  return response;
 }).catch(async()=>await caches.match(event.request)||Response.error()));
});
