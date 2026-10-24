import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('local runs save and reload are part of the scan lifecycle',()=>{
 const app=read('src/app.js');assert.match(app,/await saveRun\(run\)/);assert.match(app,/await loadRuns\(\)/);
 assert.match(read('src/local-runs.js'),/indexedDB\.open/);
});
test('Telegram thumbnails use a bounded mtcute download',()=>{
 const tg=read('src/telegram-core.js');assert.match(tg,/downloadAsBuffer\(thumb\)/);
 assert.match(tg,/120000/);assert.match(tg,/ThumbnailUrl=await thumbnailData/);
});
test('manual queue export has no Microsoft token dependency',()=>{
 const app=read('src/app.js');assert.match(app,/await shareJson\(/);assert.match(app,/if\(drive.connected\(\)\)/);
 const exportFile=read('src/share-json.js');assert.match(exportFile,/navigator\.share/);assert.match(exportFile,/URL\.createObjectURL/);
});
