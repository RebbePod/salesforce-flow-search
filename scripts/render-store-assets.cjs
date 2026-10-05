const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..'),assets=root+'/store-assets';
const logo=fs.readFileSync(root+'/brand/logo.svg','utf8');
const data=[
 ['Account Create','Account_Create','Record-Triggered Flow','true','Alex Admin'],
 ['Account Deactivate','Account_Deactivate','Record-Triggered Flow','false','Jamie Admin'],
 ['Contract Approval','Contract_Approval','Screen Flow','true','Alex Admin'],
 ['Onboarding Email','Onboarding_Email','Autolaunched Flow','true','Jamie Admin'],
 ['Opportunity Renewal','Opportunity_Renewal','Scheduled Flow','true','Alex Admin'],
 ['Contact Update','Contact_Update','Record-Triggered Flow','true','Jamie Admin'],
 ['Account Support Routing','Account_Support_Routing','Screen Flow','true','Alex Admin'],
 ['Account Follow Up','Account_Follow_Up','Autolaunched Flow','false','Jamie Admin']
];
const css=`*{box-sizing:border-box}body{margin:0;background:#eef3f8;color:#142f4d;font:14px Arial,sans-serif}header.brand{height:66px;display:flex;align-items:center;gap:8px;padding:12px 40px;background:#142f4d;color:white}.brand svg{width:42px;height:42px}.brand b{font-size:16px}.brand .right{margin-left:auto;color:#a9c5d6;font-size:12px}.hero{padding:26px 40px 22px}h1{font-size:36px;letter-spacing:-1px;line-height:1.1;margin:0 0 10px}p.sub{margin:0;color:#5c7086;font-size:17px}.app{margin:0 40px;background:white;border:1px solid #d3dee8;border-radius:8px;box-shadow:0 8px 25px #142f4d0d;overflow:visible}.setup-heading{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:white;border-radius:8px 8px 0 0;border-bottom:1px solid #e2e7ed}.setup-heading b{display:block;font-size:22px;margin-top:3px}.setup-heading span{font-size:11px;letter-spacing:1px;color:#687b8e}.setup-actions{display:flex;gap:8px}button.native{background:white;color:#31516e;border:1px solid #b7c5d0;border-radius:4px;padding:8px 12px;font:12px Arial;height:32px}.slds-page-header{position:relative;background:#f7f9fb;height:106px;padding:16px 20px;border-bottom:1px solid #dce4eb}.list-title{font-size:18px;font-weight:bold}.list-type{font-size:11px;color:#687b8e;margin-bottom:5px}.countSortedByFilteredBy{position:absolute;bottom:20px;left:20px;font-size:12px;color:#60718a}.slds-button-group{position:absolute;right:20px;bottom:12px;display:flex;gap:5px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#f3f5f7;font-size:11px;color:#42586e;padding:12px;text-align:left;border-bottom:1px solid #dce4eb}td{padding:10px 12px;border-bottom:1px solid #edf0f4;height:38px;white-space:nowrap}td:first-child{color:#0176d3;font-weight:500}.pill{padding:3px 7px;border-radius:4px;background:#eaf5f1;color:#2d6757;font-size:11px}.false{background:#f1f3f5;color:#6b7885}.foot{position:absolute;bottom:19px;left:40px;right:40px;font-size:11px;color:#60718a;display:flex;justify-content:space-between}.footer-note{padding:10px 20px;font-size:11px;color:#60718a}`;
const wrapper=(title,sub,inner)=>`<html><head><style>${css}</style></head><body><header class="brand">${logo}<b>Salesforce Flow Search</b><span class="right">Find your flow.</span></header><div class="hero"><h1>${title}</h1><p class="sub">${sub}</p></div>${inner}<div class="foot"><span>Actual extension UI • Sample data in a demo Salesforce layout</span><span>Independent extension • Not affiliated with Salesforce</span></div></body></html>`;
const app=()=>`<div class="app"><div class="setup-heading"><div><span>SETUP</span><b>Flows</b></div><div class="setup-actions"><button class="native">Flow Trigger Explorer</button><button class="native">New Flow</button></div></div><div class="forceListViewManager"><div class="slds-page-header"><div class="list-type">Flow Definitions</div><div class="list-title">All Flows ▾</div><span class="countSortedByFilteredBy">8 items • Updated just now</span><div class="slds-button-group"><button class="native" title="List View Controls">⚙</button><button class="native" title="Refresh">↻</button><button class="native" title="Filter">▽</button></div></div><table role="grid"><thead><tr><th>Flow Label</th><th>Flow API Name</th><th>Process Type</th><th>Active</th><th>Last Modified By</th></tr></thead><tbody>${data.map(row=>`<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td><span class="pill ${row[3] === 'false'?'false':''}">${row[3] === 'true'?'Active':'Inactive'}</span></td><td>${row[4]}</td></tr>`).join('')}</tbody></table></div><div class="footer-note">Search filters the rows currently loaded in this list.</div></div>`;
async function save(page,name){const bytes=await page.screenshot();await sharp(bytes).removeAlpha().png().toFile(assets+'/'+name);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  await page.route('https://demo.salesforce-setup.com/**',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  async function prepare(title,sub,auto=true){
   await page.goto('https://demo.salesforce-setup.com/lightning/setup/Flows/home');
   await page.setContent(wrapper(title,sub,app()));
   await page.evaluate(auto=>{window.chrome={runtime:{id:'demo',onMessage:{addListener:()=>{}}},storage:{local:{get:async()=>({autoLoadAllFlows:auto})},onChanged:{addListener:()=>{}}}};},auto);
   await page.addScriptTag({path:root+'/extension/content.js'});
   await page.getByRole('searchbox').waitFor();
   if(auto)await page.waitForFunction(()=>document.querySelector('#flow-search-companion').shadowRoot.querySelector('#stop').hidden);
  }
  await prepare('Find the flow. Skip the hunt.','Search across the columns in your loaded Salesforce Flow list.');
  await page.getByRole('searchbox').fill('account');
  await save(page,'screenshot-01-search-1280x800.png');
  await prepare('Keep your search. Narrow the columns.','Choose one or several columns without retyping your search.');
  await page.getByRole('searchbox').fill('record-triggered');await page.getByRole('button',{name:'Search columns'}).click();
  await page.getByRole('checkbox',{name:'Process Type',exact:true}).click();
  await save(page,'screenshot-02-columns-1280x800.png');
  await prepare('Load more. Stay in control.','Automatic loading, plus simple controls to stop and resume.',false);
  await page.evaluate(()=>document.querySelector('.countSortedByFilteredBy').textContent='8+ items • Loading more flows');
  await page.getByRole('button',{name:'Load all flows'}).click();await page.waitForTimeout(1600);
  await save(page,'screenshot-04-loading-1280x800.png');
  const settings=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  await settings.route('https://package.local/**',async route=>{
   const name=new URL(route.request().url()).pathname.slice(1);
   if(['settings.html','settings.css','settings.js'].includes(name))return route.fulfill({body:fs.readFileSync(root+'/extension/'+name),contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'text/html'});
   return route.fulfill({body:'<html></html>',contentType:'text/html'});
  });
  await settings.addInitScript(()=>{window.chrome={storage:{local:{get:async()=>({autoLoadAllFlows:true,defaultSearchScope:'all',allowedPagePaths:['/lightning/setup/Flows/*','/lightning/o/FlowDefinitionView/*']}),set:async()=>{}},onChanged:{addListener:()=>{}}}};});
  await settings.goto('https://package.local/showcase');
  const left=`<div style="margin:40px 0 0 80px;max-width:500px"><h1 style="font-size:48px;line-height:1.15">Your defaults.<br>Your workflow.</h1><p style="font-size:20px;line-height:1.6;color:#5c7086">Choose where search starts.<br>Control automatic loading.<br>Set the Salesforce pages you use.</p><div style="margin-top:40px;padding:22px;border-left:3px solid #42bdb1;background:white;color:#31516e;font-size:18px;line-height:1.6">Preferences save automatically<br>and apply across your tabs.</div></div>`;
  await settings.setContent(wrapper('Settings that stay out of your way.','Simple preferences. No extra sign-in.',`<div style="display:flex;position:relative">${left}<iframe title="Actual extension settings" src="https://package.local/settings.html" style="position:absolute;left:770px;top:0;width:382px;height:540px;border:1px solid #d3dee8;box-shadow:0 12px 28px #142f4d18;border-radius:10px;background:white"></iframe></div>`));
  const frame=settings.frameLocator('iframe');await frame.locator('#scope').waitFor();await frame.locator('#scope').click();await frame.getByRole('option',{name:'Flow name and API name',exact:true}).click();
  await save(settings,'screenshot-03-settings-1280x800.png');
  const promo=await browser.newPage();
  const promoCss=`*{box-sizing:border-box}body{margin:0;background:linear-gradient(120deg,#142f4d,#194861);color:white;font-family:Arial,sans-serif;overflow:hidden}.orb{position:absolute;border:1px solid #78d6d528;border-radius:50%}.logo svg{width:100%;height:100%}`;
  await promo.setViewportSize({width:440,height:280});
  await promo.setContent(`<style>${promoCss}</style><div class="orb" style="width:380px;height:380px;right:-120px;top:-150px"></div><div class="orb" style="width:300px;height:300px;left:-170px;bottom:-180px"></div><div class="logo" style="width:104px;height:104px;margin:15px auto 0">${logo}</div><div style="text-align:center;font-size:29px;font-weight:bold;line-height:1.18;letter-spacing:-.4px">Salesforce<br>Flow Search</div><div style="width:44px;height:3px;background:#42d1c1;margin:18px auto"></div>`);
  await save(promo,'promo-small-440x280.png');
  await promo.setViewportSize({width:1400,height:560});
  await promo.setContent(`<style>${promoCss}</style><div class="orb" style="width:750px;height:750px;right:-160px;top:-100px"></div><div class="orb" style="width:540px;height:540px;right:-40px;top:0"></div><div style="position:absolute;left:86px;top:92px;font-size:16px;letter-spacing:2px;color:#91c7d4">FIND YOUR FLOW</div><div style="position:absolute;left:86px;top:148px;font-size:70px;line-height:1.04;font-weight:bold;letter-spacing:-2px">Salesforce<br>Flow Search</div><div style="position:absolute;left:86px;top:358px;font-size:24px;color:#b3d2dd">Search. Narrow. Keep moving.</div><div class="logo" style="position:absolute;width:330px;height:330px;right:124px;top:113px">${logo}</div>`);
  await save(promo,'promo-marquee-1400x560.png');
  console.log('Rendered four actual-UI demo screenshots and two promotional graphics.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});


