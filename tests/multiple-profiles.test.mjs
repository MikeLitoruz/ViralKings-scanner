import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8'),app=readFileSync('src/app.js','utf8');
const profiles=JSON.parse(readFileSync('shared/profiles.json','utf8')).profiles.filter(p=>p.enabled!==false);
test('all eight independent profiles can be selected',()=>{
 assert.equal(profiles.length,8);
 assert.match(html,/id="profiles" class="profile-grid"/);
 assert.match(html,/id="profiles-all"/);
 assert.match(html,/id="profiles-none"/);
 assert.ok(!html.includes('id="profile"'));
 assert.match(app,/for\(const profile of profiles\)/);
});
test('separate per-profile runs and filters',()=>{
 assert.match(app,/profileId:profile.id,profileName:profile.name/);
 assert.match(app,/publishJson\(f\.Runs,/);
 assert.match(app,/discoverTelegram\(\{client:telegram.client\(\),profile/);
 assert.match(app,/discoverYoutube\(\{key:[^\n]+profile/);
});
test('cancel and explicit empty selection',()=>{
 assert.match(app,/if\(!profiles.length\)throw new Error/);
 assert.match(app,/if\(controller.signal.aborted\)break/);
 assert.match(app,/selected:new Set\(\)/);
});
