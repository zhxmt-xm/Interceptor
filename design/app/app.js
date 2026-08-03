// Interceptor design SPA — state controller.
// The whole prototype is driven by window.__setState({view,theme,sidebar,filters,overlay,tab,pop,https,mitm,copy,requestMenu,ruleFilter,bodyPreview}).
// - Humans click the sidebar / floating controls; state + DOM update live.
// - The screenshot pipeline (shoot.mjs) calls __setState then captures .app.
const app = document.querySelector('.app');

// Unified sidebar. Active item follows data-view. HTTPS setup/import-export are overlays,
// so they are NOT nav items — they are triggered from the floating controls / __setState.
const NAV = [
  { id: 'capture', icon: 'i-activity', label: 'Capture' },
  { id: 'rules', icon: 'i-branch', label: 'Rules &amp; Map' },
  { id: 'composer', icon: 'i-send', label: 'Composer' },
  { id: 'breakpoints', icon: 'i-pause', label: 'Breakpoints' },
  { id: 'diagnostics', icon: 'i-terminal', label: 'Diagnostics' },
];

const LANGS = {
  en: { code: 'EN', name: 'English' },
  'zh-CN': { code: '简', name: '简体中文' },
  'zh-TW': { code: '繁', name: '繁體中文' },
  ja: { code: '日', name: '日本語' },
  ko: { code: '한', name: '한국어' },
  de: { code: 'DE', name: 'Deutsch' },
  fr: { code: 'FR', name: 'Français' },
  es: { code: 'ES', name: 'Español' },
  it: { code: 'IT', name: 'Italiano' },
  'pt-BR': { code: 'PT', name: 'Português (Brasil)' },
  ru: { code: 'RU', name: 'Русский' },
  nl: { code: 'NL', name: 'Nederlands' },
  pl: { code: 'PL', name: 'Polski' },
  tr: { code: 'TR', name: 'Türkçe' },
  uk: { code: 'UA', name: 'Українська' },
};

function renderSidebar(active) {
  const side = app.querySelector('.side');
  const item = (it) =>
    `<div class="nav${it.id === active ? ' on' : ''}" data-nav="${it.id}"><svg><use href="#${it.icon}"/></svg><span class="txt">${it.label}</span></div>`;

  // Footer theme + language switchers.
  const theme = app.getAttribute('data-theme') || 'light';
  const lang = app.dataset.lang || 'en';
  // Four themes read as one day: warm=dawn · light=noon · ember=dusk · dark=night.
  const themeIcon = { warm: 'i-sunrise', light: 'i-sun', ember: 'i-sunset', dark: 'i-moon' }[theme];
  const language = LANGS[lang] || LANGS.en;
  const langCode = language.code;
  const themeCtl = `<div class="nav thtrigger" data-thtrigger><svg><use href="#${themeIcon}"/></svg><span class="txt">Theme</span><span class="thdot"></span></div>`;
  const langCtl = `<div class="nav lgtrigger" data-lgtrigger><svg><use href="#i-globe"/></svg><span class="txt">Language</span><span class="lgcode">${langCode}</span></div>`;

  side.innerHTML = `
    <div class="sbrand"><div class="logo"><svg><use href="#i-zap"/></svg></div><b>Interceptor</b></div>
    <div class="label">Workspace</div>
    ${NAV.map(item).join('')}
    <div class="label">Session</div>
    <div class="nav"><svg><use href="#i-globe"/></svg><span class="txt col"><span>Local traffic</span><small>127.0.0.1:8888</small></span><span class="live"></span></div>
    <div class="spring"></div>
    <div class="nav${active === 'settings' ? ' on' : ''}" data-nav="settings"><svg><use href="#i-settings"/></svg><span class="txt">Settings</span></div>
    ${langCtl}
    ${themeCtl}
  `;
  side.querySelectorAll('[data-nav]').forEach((el) =>
    el.addEventListener('click', () => setState({ view: el.dataset.nav })),
  );
}

// Inspector (capture) tab switching.
function setInspTab(tab) {
  app.querySelectorAll('[data-tabs="insp"] > span').forEach((s) => s.classList.toggle('on', s.dataset.tab === tab));
  app.querySelectorAll('.tp[data-tab]').forEach((p) => p.classList.toggle('on', p.dataset.tab === tab));
}

function syncCaptureListScrollbar() {
  const scroll = app.querySelector('.list-scroll');
  const head = app.querySelector('.lhead');
  if (!scroll || !head) return;
  head.style.paddingRight = `${14 + scroll.offsetWidth - scroll.clientWidth}px`;
}

// Facet groups expand where a value is actually applied; with nothing applied only the first group opens.
function syncFilterGroups() {
  const open = new Set();
  if (app.dataset.filterActive) open.add('application').add('protocol');
  if (app.dataset.ruleFilter || app.dataset.ruleOptions === 'empty') open.add('rule');
  if (app.dataset.filterGroup) open.add(app.dataset.filterGroup);
  if (!open.size) open.add('application');
  app.querySelectorAll('.fgrp').forEach((group) => group.classList.toggle('on', open.has(group.dataset.grp)));
  syncFilterBadge();
}

// Scenes drive the same selection classes a click would, so badges and per-group clears stay honest.
function applyDemoSelection() {
  const active = Boolean(app.dataset.filterActive);
  app.querySelectorAll('.fitem[data-demo]').forEach((row) =>
    row.classList.toggle('on', row.dataset.demo === (active ? 'on' : 'off')),
  );
  const rule = app.dataset.ruleFilter;
  app.querySelectorAll('.fitem[data-rule]').forEach((row) =>
    row.classList.toggle('on', row.dataset.rule === (rule ? 'stub' : 'all')),
  );
}

// A group is "applied" when anything other than its All row is selected; that also drives the toolbar badge.
function syncFilterBadge() {
  let applied = false;
  app.querySelectorAll('.fgrp').forEach((group) => {
    const rows = [...group.querySelectorAll('.fitem')];
    const on = rows.slice(1).some((row) => row.classList.contains('on'));
    group.classList.toggle('applied', on);
    applied = applied || on;
  });
  app.classList.toggle('hasfilter', applied);
}

// Restore one group (or every group) to its All row.
function clearFilterGroup(group) {
  const rows = [...group.querySelectorAll('.fitem')];
  rows.forEach((row, index) => row.classList.toggle('on', index === 0));
}

function setState(s = {}) {
  if (s.theme) app.setAttribute('data-theme', s.theme);
  if (s.sidebar) {
    app.classList.remove('expanded', 'collapsed');
    app.classList.add(s.sidebar);
  }
  if (s.lang) app.dataset.lang = s.lang;
  if (s.view) {
    app.setAttribute('data-view', s.view);
    renderSidebar(s.view);
    app.classList.remove('showpop', 'thopen', 'lgopen');
    // Detail starts closed; a scene only opens it by naming an inspector tab or row scene.
    app.classList.toggle('nodetail', !(s.tab || s.scene || s.detail === 'open'));
    delete app.dataset.tip;
    delete app.dataset.ruleSelect;
    delete app.dataset.requestMenu;
    delete app.dataset.search;
    if (!s.scene) {
      app.dataset.scene = 'http';
      app.querySelectorAll('[data-capture-row]').forEach((row) =>
        row.classList.toggle('sel', row.dataset.captureRow === 'http'),
      );
    }
    if (!s.tab) setInspTab('headers');
  }
  if (s.scene) {
    app.dataset.scene = s.scene;
    app.querySelectorAll('[data-capture-row]').forEach((row) =>
      row.classList.toggle('sel', row.dataset.captureRow === s.scene),
    );
  }
  if (s.pop) app.classList.add('showpop');
  if ('detail' in s) app.classList.toggle('nodetail', s.detail !== 'open');
  if ('filters' in s) app.dataset.filters = s.filters || 'open';
  if ('filterGroup' in s) {
    if (s.filterGroup) app.dataset.filterGroup = s.filterGroup;
    else delete app.dataset.filterGroup;
  }
  if ('filterActive' in s) {
    if (s.filterActive) app.dataset.filterActive = s.filterActive;
    else delete app.dataset.filterActive;
  }
  if ('search' in s) {
    if (s.search) {
      app.dataset.search = s.search;
      app.querySelector('.omni-q').textContent = s.search;
    } else delete app.dataset.search;
  }
  if ('tip' in s) {
    if (s.tip) app.dataset.tip = s.tip;
    else delete app.dataset.tip;
  }
  if ('pop2' in s) {
    app.classList.remove('thopen', 'lgopen');
    if (s.pop2 === 'theme') app.classList.add('thopen');
    else if (s.pop2 === 'lang') app.classList.add('lgopen');
  }
  if (s.tab) setInspTab(s.tab);
  if (s.settings) app.dataset.settings = s.settings;
  if (s.repair) app.dataset.repair = s.repair;
  if (s.update) app.dataset.update = s.update;
  if (s.https) app.dataset.https = s.https;
  if (s.mitm) app.dataset.mitm = s.mitm;
  if ('systemProxy' in s) app.dataset.systemProxy = s.systemProxy || 'on';
  if ('upstream' in s) {
    if (s.upstream) app.dataset.upstream = s.upstream;
    else delete app.dataset.upstream;
  }
  if (s.copy) app.dataset.copy = s.copy;
  if (s.transfer) app.dataset.transfer = s.transfer;
  if ('recording' in s) {
    if (s.recording) app.dataset.recording = s.recording;
    else delete app.dataset.recording;
  }
  if ('fileMenu' in s) {
    if (s.fileMenu) app.dataset.fileMenu = s.fileMenu;
    else delete app.dataset.fileMenu;
  }
  if ('ruleSelect' in s) {
    if (s.ruleSelect) app.dataset.ruleSelect = s.ruleSelect;
    else delete app.dataset.ruleSelect;
  }
  if ('requestMenu' in s) {
    if (s.requestMenu) app.dataset.requestMenu = s.requestMenu;
    else delete app.dataset.requestMenu;
  }
  if ('ruleFilter' in s) {
      if ('ruleOptions' in s) {
        if (s.ruleOptions) app.dataset.ruleOptions = s.ruleOptions;
        else delete app.dataset.ruleOptions;
      }
    if (s.ruleFilter) app.dataset.ruleFilter = s.ruleFilter;
    else delete app.dataset.ruleFilter;
  }
  if ('bodyPreview' in s) {
    if (s.bodyPreview) app.dataset.bodyPreview = s.bodyPreview;
    else delete app.dataset.bodyPreview;
  }
  if ('overlay' in s) {
    if (s.overlay) app.setAttribute('data-overlay', s.overlay);
    else app.removeAttribute('data-overlay');
  }
  // Re-render the sidebar whenever anything affecting the footer switchers changes.
  if (!s.view && (s.theme || s.sidebar || s.lang)) {
    renderSidebar(app.getAttribute('data-view'));
  }
  if (s.view || 'filterGroup' in s || 'filterActive' in s || 'ruleFilter' in s || 'ruleOptions' in s) {
    applyDemoSelection();
    syncFilterGroups();
  }
  if ('search' in s) syncFilterBadge();
  positionFootpop();
  positionActionPopover();
  positionRuleSelectPopover();
  positionRequestRuleMenu();
  syncCaptureListScrollbar();
  syncControls();
}
window.__setState = setState;

function positionRequestRuleMenu(clientX, clientY) {
  const menu = app.querySelector('.request-rule-menu');
  const anchor = app.querySelector('[data-request-rule-anchor]');
  if (!menu || !anchor || app.dataset.requestMenu !== 'open') return;
  const appRect = app.getBoundingClientRect();
  const targetRect = (anchor.querySelector('.hc') || anchor).getBoundingClientRect();
  const parentRect = menu.offsetParent.getBoundingClientRect();
  const desiredLeft = clientX ?? targetRect.left + targetRect.width / 2;
  const desiredTop = clientY ?? targetRect.top + targetRect.height / 2;
  const clampedLeft = Math.min(Math.max(desiredLeft, appRect.left + 8), appRect.right - menu.offsetWidth - 8);
  const clampedTop = Math.min(Math.max(desiredTop, appRect.top + 8), appRect.bottom - menu.offsetHeight - 8);
  menu.style.left = `${clampedLeft - parentRect.left}px`;
  menu.style.top = `${clampedTop - parentRect.top}px`;
}

function positionActionPopover() {
  const trigger = app.querySelector('#addaction');
  const popEl = app.querySelector('.apop');
  const editor = app.querySelector('.reditor');
  if (!trigger || !popEl || !editor || app.dataset.view !== 'rules' || !app.classList.contains('showpop')) return;

  const gap = 4;
  const appRect = app.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const fitsRight = triggerRect.right + gap + popEl.offsetWidth <= appRect.right;
  const left = fitsRight
    ? triggerRect.right - editorRect.left + gap
    : triggerRect.left - editorRect.left - popEl.offsetWidth - gap;
  const centeredTop = triggerRect.top - editorRect.top
    + (triggerRect.height - popEl.offsetHeight) / 2;
  const minTop = appRect.top - editorRect.top;
  const maxTop = appRect.bottom - editorRect.top - popEl.offsetHeight;

  popEl.style.left = `${left}px`;
  popEl.style.top = `${Math.min(Math.max(centeredTop, minTop), maxTop)}px`;
}

function positionRuleSelectPopover() {
  const trigger = app.querySelector('[data-rule-select-trigger]');
  const popEl = app.querySelector('.rule-select-pop');
  const editor = app.querySelector('.reditor');
  if (!trigger || !popEl || !editor || app.dataset.ruleSelect !== 'open') return;

  const gap = 4;
  const appRect = app.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const fitsBelow = triggerRect.bottom + gap + popEl.offsetHeight <= appRect.bottom;
  const top = fitsBelow
    ? triggerRect.bottom - editorRect.top + gap
    : triggerRect.top - editorRect.top - popEl.offsetHeight - gap;

  popEl.style.top = `${top}px`;
  popEl.style.left = `${triggerRect.left - editorRect.left}px`;
  popEl.style.width = `${triggerRect.width}px`;
}

const captureListScroll = app.querySelector('.list-scroll');
if (captureListScroll) {
  new ResizeObserver(syncCaptureListScrollbar).observe(captureListScroll);
}

// Anchor the open footer popover to the trigger button: just past the button's right edge, bottom edges flush.
function positionFootpop() {
  const which = app.classList.contains('thopen') ? 'theme' : app.classList.contains('lgopen') ? 'lang' : '';
  if (!which) return;
  const trigger = app.querySelector(which === 'theme' ? '[data-thtrigger]' : '[data-lgtrigger]');
  const popEl = app.querySelector('.footpop.' + which);
  if (!trigger || !popEl) return;
  // offset* keeps trigger + popover in the same coordinate space (offsetParent = .app), so the
  // bottom edges line up exactly regardless of the .app border.
  popEl.style.left = trigger.offsetLeft + trigger.offsetWidth + 6 + 'px';
  popEl.style.top = trigger.offsetTop + trigger.offsetHeight - popEl.offsetHeight + 'px';
  popEl.style.bottom = 'auto';
}

// Reflect current state on the dock switches.
function syncControls() {
  const map = {
    view: app.getAttribute('data-view'),
    theme: app.getAttribute('data-theme'),
    sidebar: app.classList.contains('collapsed') ? 'collapsed' : 'expanded',
    overlay: app.getAttribute('data-overlay') || 'none',
  };
  document.querySelectorAll('.dock .switch').forEach((box) => {
    const key = box.dataset.key;
    box.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.set === map[key])),
    );
  });
}

// Design dock: collapsible controls (open/close with the round button).
const dock = document.querySelector('.dock');
dock.querySelector('.dock-toggle').addEventListener('click', () => {
  dock.dataset.open = dock.dataset.open === 'true' ? 'false' : 'true';
});
dock.querySelectorAll('.switch').forEach((box) => {
  const key = box.dataset.key;
  box.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => setState({ [key]: b.dataset.set === 'none' ? '' : b.dataset.set })),
  );
});

// Toggle the omni / add-action popover on filter-button click (capture + rules).
app.addEventListener('click', (e) => {
  if (e.target.closest('.header-sidebar-toggle-v2')) {
    return setState({ sidebar: app.classList.contains('collapsed') ? 'expanded' : 'collapsed' });
  }
  const fileTrigger = e.target.closest('[data-file-trigger]');
  if (fileTrigger) {
    const next = app.dataset.fileMenu === fileTrigger.dataset.fileTrigger
      ? ''
      : fileTrigger.dataset.fileTrigger;
    return setState({ fileMenu: next });
  }
  if (e.target.closest('#addaction')) {
    app.classList.toggle('showpop');
    positionActionPopover();
  }
  if (e.target.closest('[data-rule-select-trigger]')) {
    const open = app.dataset.ruleSelect === 'open';
    setState({ ruleSelect: open ? '' : 'open' });
  }
});

window.addEventListener('resize', positionActionPopover);
window.addEventListener('resize', positionRuleSelectPopover);
window.addEventListener('resize', positionRequestRuleMenu);

app.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('[data-request-rule-anchor]')) return;
  e.preventDefault();
  setState({ requestMenu: 'open' });
  positionRequestRuleMenu(e.clientX, e.clientY);
});

// Settings section and guarded repair confirmation states.
app.addEventListener('click', (e) => {
  const settingsNav = e.target.closest('[data-settings-nav]');
  if (settingsNav) return setState({ settings: settingsNav.dataset.settingsNav, repair: 'idle' });
  if (e.target.closest('.repair-idle .danger')) return setState({ repair: 'confirm' });
  if (e.target.closest('.repair-confirm .btn:not(.danger)')) return setState({ repair: 'idle' });
});

// Inspector tab clicks.
app.querySelectorAll('[data-tabs="insp"] > span').forEach((s) =>
  s.addEventListener('click', () => setInspTab(s.dataset.tab)),
);

// Capture filter panel, search clear and inspector close (interactive preview).
app.addEventListener('click', (e) => {
  // Panel toggle in the list toolbar.
  if (e.target.closest('.cfilters-toggle')) {
    return setState({ filters: app.dataset.filters === 'closed' ? 'open' : 'closed' });
  }
  // Recording toggle.
  if (e.target.closest('.rec')) {
    return setState({ recording: app.dataset.recording === 'paused' ? '' : 'paused' });
  }
  // Per-group clear (hover action in the group header) restores that group to All.
  const groupClear = e.target.closest('.fgrp-clear');
  if (groupClear) {
    clearFilterGroup(groupClear.closest('.fgrp'));
    syncFilterBadge();
    return;
  }
  // Group header -> collapse / expand that facet group.
  const groupHead = e.target.closest('.fgrp-toggle');
  if (groupHead) {
    groupHead.closest('.fgrp').classList.toggle('on');
    return;
  }
  // Facet row -> "All" resets the group, any other value toggles (multi-select = OR).
  const facet = e.target.closest('.fitem');
  if (facet) {
    const rows = [...facet.closest('.fgrp-b').querySelectorAll('.fitem')];
    const all = rows[0];
    if (facet === all) rows.forEach((row) => row.classList.toggle('on', row === all));
    else {
      facet.classList.toggle('on');
      all.classList.toggle('on', !rows.slice(1).some((row) => row.classList.contains('on')));
    }
    syncFilterBadge();
    return;
  }
  // The in-box clear only empties the search text.
  if (e.target.closest('.omni-clear')) {
    return setState({ search: '' });
  }
  // The action next to the box clears every applied facet; the search box is an independent dimension.
  if (e.target.closest('.cfilters-clear')) {
    app.querySelectorAll('.fgrp').forEach(clearFilterGroup);
    syncFilterBadge();
    return;
  }
  // Inspector close -> hide the detail pane; the list expands to full width.
  if (e.target.closest('.iclose')) {
    app.classList.add('nodetail');
    return;
  }
  // Clicking a captured request opens the detail pane.
  const row = e.target.closest('.list-scroll .row');
  if (row) {
    app.querySelectorAll('.list-scroll .row').forEach((r) => r.classList.toggle('sel', r === row));
    app.classList.remove('nodetail');
    return;
  }
  if (e.target.closest('.request-rule-menu .fi')) {
    return setState({ view: 'rules', requestMenu: '' });
  }
  if (e.target.closest('[data-show-rule-requests]')) {
    return setState({ view: 'capture', ruleFilter: 'rule-stub' });
  }
  if (e.target.closest('[data-rule-link]')) {
    return setState({ view: 'rules' });
  }
  // Capture rows switch the inspector scene and reopen the detail pane.
  const captureRow = e.target.closest('[data-capture-row]');
  if (captureRow) {
    app.classList.remove('nodetail');
    const scene = captureRow.dataset.captureRow;
    return setState({ scene, tab: scene === 'tunnel' ? 'tunnel' : scene === 'websocket' ? 'messages' : scene === 'grpc' ? 'grpc' : 'headers' });
  }
  if (e.target.closest('[data-open-https]')) return setState({ overlay: 'https-setup' });
  if (e.target.closest('[data-close-overlay]')) return setState({ overlay: '' });
});

// Footer theme and language popovers.
app.addEventListener('click', (e) => {
  const tset = e.target.closest('[data-themeset]');
  if (tset) return setState({ theme: tset.dataset.themeset });
  const lset = e.target.closest('[data-langset]');
  if (lset) return setState({ lang: lset.dataset.langset, pop2: '' });
  if (e.target.closest('[data-thtrigger]'))
    return setState({ pop2: app.classList.contains('thopen') ? '' : 'theme' });
  if (e.target.closest('[data-lgtrigger]'))
    return setState({ pop2: app.classList.contains('lgopen') ? '' : 'lang' });
});

// Rules matcher value toggles: Aa (case, independent) + = (exact) / .* (regex) mutually exclusive.
app.addEventListener('click', (e) => {
  const mtg = e.target.closest('.mtg');
  if (!mtg) return;
  if (mtg.dataset.mtg === 'case') {
    mtg.classList.toggle('on');
    return;
  }
  const turnOn = !mtg.classList.contains('on');
  mtg.closest('.mtoggles')
    .querySelectorAll('[data-mtg="exact"],[data-mtg="regex"]')
    .forEach((b) => b.classList.remove('on'));
  mtg.classList.toggle('on', turnOn);
});

// Initial paint.
app.dataset.lang = app.dataset.lang || 'en';
renderSidebar(app.getAttribute('data-view') || 'capture');
syncControls();
