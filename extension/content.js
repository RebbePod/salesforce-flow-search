(() => {
  'use strict';
  if (globalThis.__flowSearchCompanion) return;
  globalThis.__flowSearchCompanion = true;
  const roots = () => {
    const found = [document];
    for (let i = 0; i < found.length; i++) {
      for (const el of found[i].querySelectorAll('*')) {
        if (el.shadowRoot) found.push(el.shadowRoot);
      }
    }
    return found;
  };
  const find = (selector) => roots().flatMap(root => [...root.querySelectorAll(selector)]);
  const hasNativeFlowSearch = () => /^\/lightning\/o\/FlowRecord\/home\/?$/i.test(location.pathname);
  const flowRoute = () => /\/setup\/Flows(?:\/|$|\?)/i.test(location.pathname + location.search) ||
    /\/lightning\/o\/FlowDefinitionView\//i.test(location.pathname);
  const visible = el => !!el.getClientRects().length;
  const rows = table => [...table.querySelectorAll('tbody tr, [role="row"]')]
    .filter(row => row.querySelector('td, [role="gridcell"], [role="rowheader"]'));
  const headers = table => [...table.querySelectorAll('thead th, [role="columnheader"]')];
  function flowList() {
    return find('table, [role="grid"]').find(table => visible(table) &&
      (headers(table).some(h => /flow\s*(label|name)/i.test(h.textContent + ' ' + h.getAttribute('aria-label'))) ||
       (flowRoute() && headers(table).some(h => /^(flow label|flow name|label|name)$/i.test(h.textContent.trim())))));
  }
  let table, host, ui, timer, loading = false, message = '';
  let autoLoad = true, settingsReady = false, autoSuppressed = false, allLoaded = false;
  const defaultPages = ['/lightning/setup/Flows/*', '/lightning/o/FlowDefinitionView/*'];
  let allowedPages = defaultPages;
  let defaultScope = 'all', selectedColumns = null;
  const validScope = value => ['name','name-api'].includes(value) ? value : 'all';
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const pageAllowed = () => allowedPages.some(pattern => {
    if (typeof pattern !== 'string' || !pattern.startsWith('/')) return false;
    const expression = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp('^' + expression + '$', 'i').test(location.pathname);
  });
  let toolbar, toolbarActions, originalPosition;
  function positionSearch() {
    if (!host || !toolbar?.isConnected) return;
    const bounds = toolbar.getBoundingClientRect();
    const actions = toolbarActions?.isConnected ? toolbarActions.getBoundingClientRect() : null;
    const buttons = [...toolbar.querySelectorAll('button')].filter(visible).map(el => el.getBoundingClientRect());
    const actionLeft = Math.min(actions?.left ?? bounds.right - 16,
      ...buttons.filter(rect => rect.left > bounds.left + bounds.width * .6).map(rect => rect.left));
    const count = toolbar.querySelector('.countSortedByFilteredBy');
    const status = count?.closest('force-list-view-manager-status-info') || count;
    const textRects = [];
    if (status) {
      const walker = document.createTreeWalker(status, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || !visible(node.parentElement) || node.parentElement.closest('.slds-assistive-text')) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        textRects.push(...[...range.getClientRects()].filter(rect => rect.width && rect.height));
      }
    }
    // Measure the actual status text, including the separate "Updated…" span.
    // Its flex column fills the row, so measuring that column overstates its width.
    const left = Math.max(16, ...textRects.map(rect => rect.right - bounds.left + 16));
    const right = Math.max(16, bounds.right - actionLeft + 16);
    const width = bounds.width - left - right;
    if (width < 260) {
      host.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;width:auto;z-index:2147483646;';
      return;
    }
    const center = actions ? actions.top - bounds.top + actions.height / 2 : bounds.height / 2;
    host.style.cssText = `position:absolute;display:block;left:${left}px;right:${right}px;top:${center}px;width:auto;padding:0;box-sizing:border-box;transform:translateY(-50%);z-index:5;`;
  }
  function detachSearch() {
    host?.remove();
    if (toolbar && originalPosition !== undefined) toolbar.style.position = originalPosition;
    toolbar = toolbarActions = undefined; originalPosition = undefined;
  }
  const changed = new Map();
  const errors = [];
  function recordError(error) {
    // Keep extension errors only; no Salesforce row values or stack URLs.
    errors.push({time: new Date().toISOString(), name: error?.name || 'Error',
      message: String(error?.message || error).replace(/https?:\/\/[^\s]+/g, '[URL omitted]').slice(0, 400)});
    if (errors.length > 10) errors.shift();
    console.warn('[Flow Search Companion]', errors[errors.length - 1]);
  }
  function domainKind(hostname) {
    return ['lightning.force.com', 'salesforce-setup.com', 'salesforce.com', 'force.com']
      .find(domain => hostname === domain || hostname.endsWith('.' + domain)) || 'other';
  }
  function describe(el) {
    return {tag: el.tagName.toLowerCase(), role: el.getAttribute('role'),
      classes: [...el.classList].slice(0, 8), visible: visible(el)};
  }
  function diagnostic() {
    const allRoots = roots();
    const lists = allRoots.flatMap(root => [...root.querySelectorAll('table,[role="grid"],[role="treegrid"]')]);
    return {
      version: chrome.runtime.getManifest().version,
      domain: domainKind(location.hostname), topFrame: window === window.top,
      readyState: document.readyState, knownFlowRoute: flowRoute(),
      flowHeadingFound: find('h1,h2').some(h => /^flows$/i.test(h.textContent.trim())),
      openShadowRoots: allRoots.length - 1,
      panelMounted: !!host?.isConnected, selectedList: table ? describe(table) : null,
      loading, autoLoad, renderedRows: table ? rows(table).length : 0,
      candidates: lists.slice(0, 15).map(el => ({...describe(el), rows: rows(el).length,
        headers: headers(el).slice(0, 25).map(h => (h.getAttribute('aria-label') || h.textContent).trim().slice(0, 100))})),
      childFrames: find('iframe').slice(0, 15).map(el => {
        let domain = 'blank';
        try { domain = domainKind(new URL(el.getAttribute('src') || 'about:blank', location.href).hostname); } catch { domain = 'invalid'; }
        return {domain, visible: visible(el)};
      }),
      errors: [...errors]
    };
  }
  // Keep diagnostics available internally without displaying a debug popup.
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (request.type === 'flow-search-command') {
      try {
        refresh();
        if (request.command === 'rescan') {respond({ok:true}); return;}
        if (!table || !ui) {respond({ok:false,message:'No Flow list detected. Collect a debug report.'}); return;}
        switch (request.command) {
          case 'search': ui.querySelector('input').value = String(request.query || '').slice(0,500); message = ''; filter(); break;
          case 'clear': ui.querySelector('input').value = ''; message = ''; filter(); break;
          case 'show': host.hidden = false; host.scrollIntoView({block:'nearest'}); ui.querySelector('input').focus(); break;
          case 'hide': host.hidden = true; break;
          case 'load': if (!loading) load(); break;
          case 'stop': stop('Loading stopped.'); break;
          default: respond({ok:false,message:'Unknown action.'}); return;
        }
        respond({ok:true,message:ui.querySelector('#status').textContent});
      } catch (error) {recordError(error); respond({ok:false,message:'Action failed. Collect a debug report.'});}
      return;
    }
    if (request.type !== 'flow-search-debug') return;
    let report;
    try { report = diagnostic(); } catch (error) { recordError(error); report = {errors: [...errors]}; }
    chrome.runtime.sendMessage({type:'flow-search-debug-result', requestId: request.requestId, report}).catch(() => {});
    respond({received:true});
  });
  function restore() {
    for (const [row, value] of changed) row.style.display = value;
    changed.clear();
  }
  function mount() {
    autoSuppressed = false;
    allLoaded = false;
    selectedColumns = null;
    host = document.createElement('div');
    host.id = 'flow-search-companion';
    host.style.cssText = 'position:absolute;display:block;width:max-content;padding:0;box-sizing:border-box;transform:translateY(-50%);z-index:5;';
    ui = host.attachShadow({mode:'open'});
    ui.innerHTML = `<style>
      :host{font:13px Arial,sans-serif;color:#181818}section{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;width:100%;max-width:100%}
      .field{position:relative;flex:1 1 0;min-width:100px}input{box-sizing:border-box;width:100%;height:32px;padding:6px 34px 6px 34px;border:1px solid #747474;border-radius:4px;background:white;font:inherit;font-size:14px;color:#181818}
      input::placeholder{color:#747474;opacity:1}input::-webkit-search-cancel-button,input::-webkit-search-decoration{-webkit-appearance:none;display:none}
      .search-icon{position:absolute;left:10px;top:7px;width:18px;height:18px;color:#747474;pointer-events:none}
      .field .clear-search{position:absolute;right:9px;top:7px;width:18px;height:18px;border:0;border-radius:50%;background:#747474;color:white;padding:0;display:grid;place-items:center;cursor:pointer}
      .field .clear-search[hidden]{display:none}.clear-search svg{width:12px;height:12px}.clear-search:focus-visible{outline:2px solid #0176d3;outline-offset:2px}
      input:focus{outline:2px solid #0176d3;outline-offset:1px}button{height:32px;padding:6px 12px;border:1px solid #c9c9c9;border-radius:4px;background:white;color:#0176d3;cursor:pointer}
      button{white-space:nowrap;flex-shrink:0}p{font-size:11px;margin:0;line-height:1.4;color:#555;background:#eaf0f6;padding:4px 8px;border-radius:4px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis}
      #matches{position:absolute;right:36px;top:6px;height:20px;box-sizing:border-box;border-radius:4px;padding:3px 7px;background:#eef2f6;color:#53647a;font-size:11px;line-height:14px;pointer-events:none;white-space:nowrap}
      #spinner{position:absolute;left:10px;top:8px;width:16px;height:16px;box-sizing:border-box;border:2px solid #d8e5f3;border-top-color:#0176d3;border-radius:50%;animation:spin .8s linear infinite}
      #stop{position:absolute;left:32px;top:6px;width:20px;height:20px;box-sizing:border-box;border:1px solid #c9c9c9;border-radius:50%;padding:0;display:grid;place-items:center;color:#64748b;background:white}#stop svg{width:14px;height:14px}#stop:hover{color:#ba0517;border-color:#ba0517}
      #load{position:absolute;left:8px;top:5px;width:22px;height:22px;box-sizing:border-box;border:0;border-radius:50%;padding:2px;background:transparent;color:#0176d3;display:grid;place-items:center}#load svg{width:18px;height:18px}#load:hover{background:#eaf3ff}#load:focus-visible,#stop:focus-visible{outline:2px solid #0176d3;outline-offset:2px}#load[hidden]{display:none}
      #stop[hidden],#spinner[hidden],#matches[hidden]{display:none}.field.loading input{padding-left:62px}
      #status{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;padding:0;margin:-1px;white-space:nowrap}
      section{position:relative}#columns{position:absolute;right:1px;top:1px;width:34px;height:30px;padding:8px;border:0;border-left:1px solid #c9c9c9;border-radius:0 3px 3px 0;display:grid;place-items:center;color:#747474;background:#fafafa}#columns[hidden]{display:none}#columns svg{width:16px;height:16px;transition:transform .12s}#columns[aria-expanded="true"] svg{transform:rotate(180deg)}#columns:hover,#columns.active{color:#0176d3;background:#eef6ff}#columns:focus-visible{outline:2px solid #0176d3;outline-offset:-2px}.field.has-query .clear-search{right:45px}.field.has-query #matches{right:72px}#column-menu{position:absolute;right:0;top:38px;min-width:240px;max-width:300px;max-height:320px;overflow:auto;padding:6px;background:white;border:1px solid #c9c9c9;border-radius:6px;box-shadow:0 4px 16px #0002;z-index:10}#column-menu[hidden]{display:none}#column-menu strong{display:block;margin:5px 10px 6px;color:#555;font-size:12px}#column-menu .column-option{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;min-height:38px;height:auto;padding:10px;border:0;border-radius:4px;background:white;color:#181818;cursor:pointer;font:13px Arial,sans-serif;text-align:left}#column-menu .column-option:hover{background:#f3f6fb}#column-menu .column-option[aria-checked="true"]{background:#eef6ff;color:#014486}.check-mark{width:16px;height:16px;box-sizing:border-box;border:1px solid #8c8c8c;border-radius:3px;flex-shrink:0;pointer-events:none;display:grid;place-items:center;color:white}.check-mark svg{width:12px;height:12px;display:block;visibility:hidden}.column-option[aria-checked="true"] .check-mark svg{visibility:visible}.column-option[aria-checked="true"] .check-mark{background:#0176d3;border-color:#0176d3}#column-menu .column-option:focus-visible{outline:1px solid #7baee2;outline-offset:-1px}#column-options{border-top:1px solid #e5e5e5;margin-top:5px;padding-top:5px}

      @keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#spinner{animation:none}}
      </style><section aria-label="Flow search"><div class="field"><svg class="search-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg><input id="query" type="search" aria-label="Search flows" placeholder="Search this list..."><button id="clear-search" class="clear-search" type="button" aria-label="Clear search" title="Clear search" hidden><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m4 4 8 8M12 4l-8 8"/></svg></button><span id="matches" hidden></span><span id="spinner" aria-label="Loading flows" hidden></span><button id="stop" type="button" aria-label="Stop loading" title="Stop loading" hidden><svg aria-hidden="true" viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/></svg></button><button id="load" type="button" aria-label="Load all flows" title="Load all flows" hidden><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11m-4-4 4 4 4-4M4 16v4h16v-4"/></svg></button><button id="columns" type="button" aria-label="Search columns" aria-expanded="false" title="Search all columns" hidden><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="m5 9 7 7 7-7z"/></svg></button></div><div id="column-menu" hidden><strong>Search in</strong><button id="all-columns" class="column-option" type="button" role="checkbox" aria-checked="true"><span class="check-mark" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6 2.3 2.5 4.7-5"/></svg></span>All columns</button><div id="column-options"></div></div><p id="status" role="status"></p></section>`;
    ui.querySelector('input').addEventListener('input', () => { message = ''; safely(filter); });
    ui.querySelector('#clear-search').addEventListener('click', () => safely(() => {
      ui.querySelector('input').value = ''; message = ''; filter(); ui.querySelector('input').focus();
    }));
    const picker = ui.querySelector('#columns'), menu = ui.querySelector('#column-menu');
    picker.addEventListener('click', () => {
      renderColumnPicker(); menu.hidden = !menu.hidden; picker.setAttribute('aria-expanded', String(!menu.hidden));
      const bounds = host.getBoundingClientRect();
      const upwards = bounds.bottom + menu.offsetHeight + 6 > innerHeight && bounds.top > innerHeight - bounds.bottom;
      menu.style.top = upwards ? 'auto' : '38px'; menu.style.bottom = upwards ? '38px' : 'auto';
    });
    ui.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) {menu.hidden = true; picker.setAttribute('aria-expanded','false'); picker.focus();}
    });
    // Keep Salesforce's header click handlers from acting on menu selections.
    // Row clicks activate their checkbox through the label's default action.
    for (const type of ['pointerdown','mousedown']) menu.addEventListener(type, event => {event.preventDefault(); event.stopPropagation();});
    menu.addEventListener('click', event => event.stopPropagation());
    ui.querySelector('#load').addEventListener('click', () => safely(load));
    ui.querySelector('#stop').addEventListener('click', () => safely(() => stop('Loading stopped.')));
    const scope = table.closest('.forceListViewManager') || table.getRootNode();
    const count = [...scope.querySelectorAll('.countSortedByFilteredBy')].find(visible);
    toolbar = count?.closest('.slds-page-header, .forceListViewManagerHeader');
    // Some Salesforce versions omit those header classes. Find the count's
    // nearest ancestor with action buttons, stopping before the table container.
    for (let node = count?.parentElement; !toolbar && node && !node.contains(table); node = node.parentElement) {
      if (node.querySelector('button')) toolbar = node;
    }
    if (toolbar) {
      const refreshButton = [...toolbar.querySelectorAll('button')].find(button => visible(button) &&
        /refresh/i.test((button.getAttribute('title') || '') + ' ' + (button.getAttribute('aria-label') || '') + ' ' + button.textContent));
      toolbarActions = refreshButton?.closest('.slds-button-group, .slds-button-group-list') || refreshButton;
      if (getComputedStyle(toolbar).position === 'static') {originalPosition = toolbar.style.position; toolbar.style.position = 'relative';}
      toolbar.append(host); positionSearch();
    } else {
      // Compact fallback if Salesforce exposes no recognizable list toolbar.
      host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;max-width:calc(100vw - 32px);';
      document.body.append(host);
    }
    updateControls();
  }
  function updateControls() {
    if (!ui) return;
    const loadIcon = ui.querySelector('#load');
    loadIcon.hidden = loading || allLoaded || (autoLoad && !autoSuppressed);
    loadIcon.title = autoSuppressed ? 'Resume loading remaining flows' : 'Load all flows';
    ui.querySelector('#stop').hidden = !loading;
    ui.querySelector('#spinner').hidden = !loading;
    ui.querySelector('.search-icon').style.display = loading || !loadIcon.hidden ? 'none' : '';
    ui.querySelector('.field').classList.toggle('loading', loading);
    ui.querySelector('input').disabled = loading;
    ui.querySelector('#clear-search').hidden = loading || !ui.querySelector('input').value;
    updateScopeButton();
  }
  function columnLabel(header) {
    return normalize(header.getAttribute('aria-label') || header.querySelector('[title]')?.getAttribute('title') || header.textContent);
  }
  function availableColumns() {
    return headers(table).filter(header => visible(header) && getComputedStyle(header).display !== 'none' && !/^(item number|action|actions|select all)$/.test(columnLabel(header)));
  }
  function searchColumns() {
    if (selectedColumns !== null) return selectedColumns.length ? selectedColumns : null;
    if (defaultScope === 'name') return headers(table).filter(header => /^(flow label|flow name|label|name)$/.test(columnLabel(header))).map(columnLabel);
    if (defaultScope === 'name-api') return headers(table).filter(header => /^(flow label|flow name|label|name|api name|flow api name|apiname|developer name)$/.test(columnLabel(header))).map(columnLabel);
    return null;
  }
  function scopeDescription() {
    const scope = searchColumns();
    return scope === null ? 'Search all columns' : 'Search in: ' + scope.join(', ');
  }
  function updateScopeButton() {
    const button = ui.querySelector('#columns');
    button.title = scopeDescription(); button.classList.toggle('active', searchColumns() !== null);
    button.hidden = loading || !ui.querySelector('#query').value.trim();
    ui.querySelector('.field').classList.toggle('has-query', !button.hidden);
    if (button.hidden) {ui.querySelector('#column-menu').hidden = true; button.setAttribute('aria-expanded','false');}
  }
  function renderColumnPicker() {
    const options = ui.querySelector('#column-options'), all = ui.querySelector('#all-columns');
    all.onclick = event => {event.preventDefault(); event.stopPropagation(); selectedColumns = []; syncColumnPicker(); filter(); all.focus({preventScroll:true});};
    options.replaceChildren();
    for (const header of availableColumns()) {
      const key = columnLabel(header), row = document.createElement('button'), mark = document.createElement('span');
      row.type = 'button'; row.className = 'column-option'; row.setAttribute('role','checkbox'); row.dataset.column = key;
      mark.className = 'check-mark'; mark.setAttribute('aria-hidden','true'); mark.innerHTML = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6 2.3 2.5 4.7-5"/></svg>';
      row.append(mark,document.createTextNode(header.getAttribute('aria-label') || header.querySelector('[title]')?.getAttribute('title') || header.textContent.trim()));
      row.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        const chosen = searchColumns() || [];
        selectedColumns = chosen.includes(key) ? chosen.filter(item => item !== key) : [...chosen,key];
        syncColumnPicker(); filter();
        row.focus({preventScroll:true});
      });
      options.append(row);
    }
    syncColumnPicker();
  }
  function syncColumnPicker() {
    const scope = searchColumns();
    ui.querySelector('#all-columns').setAttribute('aria-checked', String(scope === null));
    for (const row of ui.querySelectorAll('#column-options .column-option')) row.setAttribute('aria-checked', String(scope !== null && scope.includes(row.dataset.column)));
  }
  function filter() {
    if (!table || !host) return;
    ui.querySelector('#clear-search').hidden = loading || !ui.querySelector('input').value;
    if (loading) {
      setStatus(`Loading… ${rows(table).length}`, `Loading flows… ${rows(table).length} rows loaded.`);
      return;
    }
    const query = ui.querySelector('input').value.trim().toLocaleLowerCase();
    const hs = headers(table);
    const scope = searchColumns();
    const indexes = hs.map((header,index) => scope === null || scope.includes(columnLabel(header)) ? index : -1).filter(index => index >= 0);
    updateScopeButton();
    let count = 0;
    const current = rows(table);
    for (const row of current) {
      const cells = [...row.querySelectorAll('th,td,[role="gridcell"],[role="rowheader"]')];
      const cellData = cells.map((cell, index) => {
        if (cell.hidden || cell.getAttribute('aria-hidden') === 'true' || getComputedStyle(cell).display === 'none') return {text:'',values:[]};
        const values = [cell.textContent];
        // Include full values from truncated cells and accessible value icons.
        for (const el of cell.querySelectorAll('[title],[aria-label],img[alt]')) {
          if (el.matches('button,[role="button"],[aria-haspopup]')) continue;
          values.push(el.getAttribute('title') || '', el.getAttribute('aria-label') || '', el.getAttribute('alt') || '');
        }
        for (const checkbox of cell.querySelectorAll('input[type="checkbox"],[role="checkbox"]')) {
          const checked = checkbox.matches('input') ? checkbox.checked : checkbox.getAttribute('aria-checked') === 'true';
          values.push(...(checked ? ['true','yes','checked'] : ['false','no','unchecked']));
          if (/^active$/i.test(hs[index]?.textContent.trim() || '')) values.push(checked ? 'active' : 'inactive');
        }
        return {text:normalize(values.join(' ')), values:values.map(normalize).filter(Boolean)};
      });
      const match = !query || indexes.some(index => cellData[index]?.text.includes(normalize(query)));
      if (!changed.has(row)) changed.set(row, row.style.display);
      row.style.display = match ? changed.get(row) : 'none';
      if (match) count++;
    }
    for (const row of changed.keys()) if (!row.isConnected) changed.delete(row);
    setStatus(message && !message.startsWith('All flows') ? `${count} / ${current.length} · Paused` : `${count} / ${current.length}`,
      `${count} matching / ${current.length} loaded rows. ${message || 'Search covers loaded rows only.'}`);
  }
  function setStatus(shortText, fullText) {
    const status = ui.querySelector('#status');
    status.textContent = fullText; status.title = fullText; status.setAttribute('aria-label', fullText);
    const matches = ui.querySelector('#matches'), input = ui.querySelector('input');
    matches.hidden = loading || !input.value.trim();
    matches.textContent = shortText.split(' · ')[0]; matches.title = fullText;
    input.style.paddingRight = matches.hidden ? '34px' : (matches.getBoundingClientRect().width + 80) + 'px';
    input.title = `${scopeDescription()}. ${message || 'Search covers loaded rows only.'}`;
  }
  function parent(el) { return el.parentElement || el.getRootNode().host; }
  function scroller() {
    for (let el = table; el; el = parent(el)) {
      if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
    }
    const legacy = find('.uiScroller, .slds-scrollable_y').find(el => visible(el) && el.contains(table));
    return legacy || document.scrollingElement;
  }
  let scrollElement, oldTop, started, lastChange, lastSignature, loaderObserver;
  function listProgress() {
    const scope = table?.closest('.forceListViewManager') || table?.getRootNode() || document;
    const status = [...scope.querySelectorAll('.countSortedByFilteredBy')].find(visible);
    const text = status?.textContent.trim() || '';
    // The original keeps scrolling while Salesforce displays a count with '+'.
    const count = text.match(/^\s*([\d,.\s]+)(\+)?\s*[^\d,.\s+]/);
    return {text, more: count?.[2] === '+', complete: !!count && !count[2]};
  }
  function stop(reason, complete = false) {
    autoSuppressed = !complete;
    allLoaded = complete;
    clearInterval(timer); loading = false; message = reason;
    loaderObserver?.disconnect(); loaderObserver = undefined;
    if (scrollElement?.isConnected) scrollElement.scrollTop = complete ? 0 : oldTop;
    updateControls();
    filter();
  }
  function load() {
    if (loading || !table || !ui) return;
    restore();
    scrollElement = scroller();
    if (!scrollElement) {message = 'No scroll container found.'; filter(); return;}
    oldTop = scrollElement.scrollTop; started = lastChange = Date.now(); lastSignature = '';
    loading = true; message = ''; updateControls();
    const step = () => {
      if (!loading) return;
      if (!table?.isConnected) {stop('List changed.'); return;}
      const progress = listProgress();
      const signature = `${rows(table).length}|${scrollElement.scrollHeight}|${progress.text}`;
      if (signature !== lastSignature) {lastSignature = signature; lastChange = Date.now();}
      const busy = table.getAttribute('aria-busy') === 'true' || scrollElement.querySelector('[aria-busy="true"], .slds-spinner');
      if (progress.complete && !busy && Date.now() - lastChange >= 600) {
        stop('All flows in this list loaded.', true); return;
      }
      if (Date.now() - started > 180000 || Date.now() - lastChange > 20000) {
        stop('Loading paused: Salesforce stopped adding rows. Some flows may remain.'); return;
      }
      // Re-trigger the bottom edge even when the previous position was already
      // at the bottom. Observe Salesforce count updates as the original does.
      if (scrollElement.scrollTop >= scrollElement.scrollHeight - scrollElement.clientHeight - 2) scrollElement.scrollTop = Math.max(0, scrollElement.scrollTop - 2);
      scrollElement.scrollTop = scrollElement.scrollHeight;
      scrollElement.dispatchEvent(new Event('scroll', {bubbles:true}));
      filter();
    };
    const status = find('force-list-view-manager-status-info, .countSortedByFilteredBy').find(visible);
    if (status) {
      loaderObserver = new MutationObserver(() => safely(step));
      loaderObserver.observe(status, {childList:true,characterData:true,subtree:true});
    }
    timer = setInterval(() => safely(step), 600); safely(step);
  }
  function refresh() {
    // Outside a known route, require a flow-specific heading or column.
    const context = settingsReady && !hasNativeFlowSearch() && pageAllowed();
    const next = context ? flowList() : undefined;
    if (next !== table || (host && !host.isConnected)) {
      if (loading) stop('List changed.');
      restore(); detachSearch(); host = undefined; ui = undefined; table = next;
      if (table && document.body) {mount(); if (settingsReady && autoLoad) load();}
    }
    filter();
    positionSearch();
    if (allLoaded && table && listProgress().more) {allLoaded = false; updateControls();}
    if (settingsReady && autoLoad && !loading && !autoSuppressed && table && listProgress().more) load();
  }
  function safely(action) {
    try { action(); } catch (error) {
      recordError(error);
      if (loading) {clearInterval(timer); loaderObserver?.disconnect(); loading = false; autoSuppressed = true; allLoaded = false; updateControls();}
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes.autoLoadAllFlows && !changes.allowedPagePaths && !changes.defaultSearchScope)) return;
    if (changes.autoLoadAllFlows) autoLoad = changes.autoLoadAllFlows.newValue !== false;
    if (changes.allowedPagePaths) allowedPages = Array.isArray(changes.allowedPagePaths.newValue) ? changes.allowedPagePaths.newValue : defaultPages;
    if (changes.defaultSearchScope) {defaultScope = validScope(changes.defaultSearchScope.newValue); selectedColumns = null; if (ui) renderColumnPicker();}
    safely(() => {
      if (!autoLoad && loading) stop('Automatic loading turned off.');
      refresh();
      updateControls();
      if (changes.autoLoadAllFlows && autoLoad && table && !loading) {autoSuppressed = false; load();}
    });
  });
  chrome.storage.local.get({autoLoadAllFlows:true,allowedPagePaths:defaultPages,defaultSearchScope:'all'}).then(settings => {
    autoLoad = settings.autoLoadAllFlows !== false; settingsReady = true;
    allowedPages = Array.isArray(settings.allowedPagePaths) ? settings.allowedPagePaths : defaultPages;
    defaultScope = validScope(settings.defaultSearchScope);
    safely(() => {refresh(); if (autoLoad && table && !loading && !autoSuppressed) load();});
  }).catch(error => {recordError(error); settingsReady = true; safely(refresh);});
  // Salesforce navigates without full reloads and can replace the entire list.
  setInterval(() => safely(refresh), 1500);
  window.addEventListener('resize', () => safely(positionSearch));
  document.addEventListener('pointerdown', event => {
    if (ui && !event.composedPath().includes(host)) {
      ui.querySelector('#column-menu').hidden = true; ui.querySelector('#columns').setAttribute('aria-expanded','false');
    }
  });
})();

