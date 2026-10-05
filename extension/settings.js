'use strict';
const checkbox = document.querySelector('#auto');
const status = document.querySelector('#status');
const defaults = ['/lightning/setup/Flows/*','/lightning/o/FlowDefinitionView/*'];
const pages = document.querySelector('#pages');
const reset = document.querySelector('#reset-pages');
let pageSaveTimer, revision = 0;
const scope = document.querySelector('#scope');
chrome.storage.local.get({autoLoadAllFlows:true,allowedPagePaths:defaults,defaultSearchScope:'all'}).then(settings => {
  checkbox.checked = settings.autoLoadAllFlows !== false; checkbox.disabled = false;
  pages.value = (Array.isArray(settings.allowedPagePaths) ? settings.allowedPagePaths : defaults).join('\n');
  pages.disabled = reset.disabled = false;
  setScope(settings.defaultSearchScope); scope.disabled = false;
  status.textContent = 'Applies to all tabs.';
}).catch(()=>{status.textContent = 'Could not read settings. Reload the extension.';});
checkbox.addEventListener('change',async()=>{
  const value = checkbox.checked; checkbox.disabled = true;
  try {await chrome.storage.local.set({autoLoadAllFlows:value});status.textContent = 'Saved. Applied to all tabs.';}
  catch {checkbox.checked = !value;status.textContent = 'Could not save. Please try again.';}
  finally {checkbox.disabled = false;}
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if (area === 'local' && changes.autoLoadAllFlows) checkbox.checked = changes.autoLoadAllFlows.newValue !== false;
  if (area === 'local' && changes.allowedPagePaths && document.activeElement !== pages) pages.value = (changes.allowedPagePaths.newValue || defaults).join('\n');
  if (area === 'local' && changes.defaultSearchScope) setScope(changes.defaultSearchScope.newValue);
});
function saveCurrentPages() {
  clearTimeout(pageSaveTimer);
  pageSaveTimer = undefined;
  const currentRevision = revision;
  const paths = [...new Set(pages.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean))];
  if (paths.length > 20 || paths.some(path=>path.length>200 || !/^\/[a-zA-Z0-9_/*.-]*$/.test(path))) {
    status.textContent = 'Use up to 20 page paths starting with /, without spaces, query strings or full URLs.';return;
  }
  status.textContent = 'Saving pages…';
  chrome.storage.local.set({allowedPagePaths:paths}).then(()=>{
    if (currentRevision === revision) status.textContent = 'Pages saved. Applied to all tabs.';
  }).catch(()=>{if (currentRevision === revision) status.textContent = 'Could not save pages. Edit again to retry.';});
}
pages.addEventListener('input',()=>{
  revision++; clearTimeout(pageSaveTimer); status.textContent = 'Editing pages…';
  pageSaveTimer = setTimeout(saveCurrentPages,350);
});
pages.addEventListener('blur',()=>{if (pageSaveTimer) saveCurrentPages();});
window.addEventListener('pagehide',()=>{if (pageSaveTimer) saveCurrentPages();});
reset.addEventListener('click',()=>{revision++;pages.value = defaults.join('\n');saveCurrentPages();});
scope.addEventListener('change', async () => {
  scope.disabled = true;
  try {await chrome.storage.local.set({defaultSearchScope:scope.value}); status.textContent = 'Search default saved. Applied to all tabs.';}
  catch {status.textContent = 'Could not save search default. Please try again.';}
  finally {scope.disabled = false;}
});

const scopeMenu = document.querySelector('#scope-menu'), scopePicker = document.querySelector('.scope-picker');
function setScope(value) {
  scope.value = ['name','name-api'].includes(value) ? value : 'all';
  for (const option of document.querySelectorAll('#scope-menu [role="option"]')) {
    const selected = option.dataset.value === scope.value;
    option.setAttribute('aria-selected',String(selected));
    if (selected) document.querySelector('#scope-text').textContent = option.childNodes[0].textContent;
  }
}
function closeScope() {scopeMenu.hidden = true; scope.setAttribute('aria-expanded','false');}
function openScope() {
  scopeMenu.hidden = false; scope.setAttribute('aria-expanded','true');
  scopeMenu.querySelector('[aria-selected="true"]').focus();
}
scope.addEventListener('click',()=>{scopeMenu.hidden ? openScope() : closeScope();});
for (const option of scopeMenu.querySelectorAll('[role="option"]')) option.addEventListener('click',()=>{
  setScope(option.dataset.value); closeScope(); scope.focus(); scope.dispatchEvent(new Event('change'));
});
scopePicker.addEventListener('keydown',event=>{
  if (event.key === 'Escape') {event.preventDefault(); closeScope(); scope.focus();}
  if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault();
    if (scopeMenu.hidden) {openScope(); return;}
    const options = [...scopeMenu.querySelectorAll('[role="option"]')], index = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length-1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next].focus();
  }
});
document.addEventListener('pointerdown',event=>{if (!scopePicker.contains(event.target)) closeScope();});
scopePicker.addEventListener('focusout',()=>setTimeout(()=>{if (!scopePicker.contains(document.activeElement)) closeScope();},0));
