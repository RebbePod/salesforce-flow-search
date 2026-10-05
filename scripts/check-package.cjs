const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ext=root+'/extension';
const manifest=JSON.parse(fs.readFileSync(ext+'/manifest.json','utf8'));
assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['storage']);
for(const f of [...manifest.content_scripts.flatMap(s=>s.js),manifest.action.default_popup,...Object.values(manifest.icons),'privacy.html'])assert.ok(fs.existsSync(ext+'/'+f),f);
for(const size of [16,32,48,128]){const p=fs.readFileSync(ext+'/icons/icon-'+size+'.png');assert.equal(p.readUInt32BE(16),size);assert.equal(p.readUInt32BE(20),size);}
for(const f of ['content.js','settings.js']){const source=fs.readFileSync(ext+'/'+f,'utf8');new Function(source);assert.ok(!/flow-search-lab-test|labsServerSearch|flowSearchServerTest/.test(source));}
for(const f of fs.readdirSync(root+'/store-assets').filter(f=>f.endsWith('.png'))){const p=fs.readFileSync(root+'/store-assets/'+f);if(f.startsWith('screenshot')){assert.equal(p.readUInt32BE(16),1280);assert.equal(p.readUInt32BE(20),800);assert.equal(p[25],2,'RGB, no alpha');}}
assert.ok(manifest.description.length<=132);console.log('Manifest, bundled resources, PNG dimensions, screenshot RGB and removal of Labs verified.');
