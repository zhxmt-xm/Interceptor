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

// Composer request editor tabs (query / headers / body / auth).
function setComposerTab(tab) {
  app.querySelectorAll('[data-tabs="creq"] > span').forEach((s) => s.classList.toggle('on', s.dataset.ctab === tab));
  app.querySelectorAll('.creq > .cpane').forEach((p) => p.classList.toggle('on', p.dataset.ctab === tab));
}

// Composer request body type (none / json / text / form).
function setBodyType(type) {
  app.dataset.bodyType = type;
  app.querySelectorAll('.bodytype span').forEach((s) => s.classList.toggle('on', s.dataset.bt === type));
}

// Composer response tabs (body / headers / cookies / timing).
function setComposerResponseTab(tab) {
  app.querySelectorAll('[data-tabs="cresp"] > span').forEach((s) => s.classList.toggle('on', s.dataset.crtab === tab));
  app.querySelectorAll('.cresp > .cpane').forEach((p) => p.classList.toggle('on', p.dataset.crtab === tab));
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

// Boot screen: three prerequisites before traffic can reach us, shown as progress dots.
// Maps to CoreProcessStatus.state / CaptureStatus.listening / SystemProxyStatus.owned.
// MITM is deliberately absent — it is set up later from Capture.
const BOOT_PHASES = {
  core: { core: 'active', listener: 'pending', proxy: 'pending' },
  listener: { core: 'done', listener: 'active', proxy: 'pending' },
  proxy: { core: 'done', listener: 'done', proxy: 'active' },
  ready: { core: 'done', listener: 'done', proxy: 'done' },
  error: { core: 'failed', listener: 'pending', proxy: 'pending' },
};

function syncBoot() {
  const boot = app.querySelector('.boot');
  const dots = BOOT_PHASES[app.dataset.boot];
  if (!boot || !dots) return;
  boot.querySelectorAll('.boot-dot').forEach((dot) => {
    dot.dataset.state = dots[dot.dataset.step];
  });
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
    }
    if (!s.tab) setInspTab('headers');
    if (!s.composerTab) setComposerTab('headers');
    if (!s.composerResponseTab) setComposerResponseTab('body');
  }
  if ('scene' in s) {
    app.dataset.scene = s.scene || 'http';
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
  if (s.composerTab) setComposerTab(s.composerTab);
  if (s.composerResponseTab) setComposerResponseTab(s.composerResponseTab);
  if ('composer' in s) {
    if (s.composer) app.dataset.composer = s.composer;
    else delete app.dataset.composer;
  }
  if ('collection' in s) app.dataset.collection = s.collection || 'open';
  if ('collectionRename' in s) {
    if (s.collectionRename) app.dataset.collectionRename = s.collectionRename;
    else delete app.dataset.collectionRename;
  }
  if ('composerHistory' in s) {
    if (s.composerHistory) app.dataset.composerHistory = s.composerHistory;
    else delete app.dataset.composerHistory;
  }
  if ('bodyType' in s) setBodyType(s.bodyType || 'json');
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
    const scene = BODY_SCENES[s.bodyPreview] ?? BODY_SCENES.json;
    app.dataset.bodyKind = scene.kind;
    app.dataset.bodyMode = scene.mode;
    if (scene.state) app.dataset.bodyState = scene.state;
    else delete app.dataset.bodyState;
  }
  if ('bodyMode' in s) {
    app.dataset.bodyMode = s.bodyMode;
    delete app.dataset.bodyState;
  }
  if ('ctxmenu' in s) {
    // 截图场景只给 ctx，落点缺省锚到该树的第一个目录行
    if (s.ctxmenu) anchorMenuForScene(s.ctxmenu);
    if (s.ctxmenu) app.setAttribute('data-ctxmenu', s.ctxmenu);
    else app.removeAttribute('data-ctxmenu');
  }
  if ('overlay' in s) {
    if (s.overlay) app.setAttribute('data-overlay', s.overlay);
    else app.removeAttribute('data-overlay');
  }
  if ('boot' in s) {
    if (s.boot) app.dataset.boot = s.boot;
    else delete app.dataset.boot;
    syncBoot();
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
  syncCaptureRowSelection();
  syncCaptureListScrollbar();
  syncControls();
}
window.__setState = setState;

// Body scenes are named shortcuts for a (kind, mode, state) triple: `kind` is the selected
// request's content type, `mode` is the active Segmented option, `state` layers Format
// busy/disabled and the tree context menu on top. Clicking never mixes the three.
const BODY_SCENES = {
  json: { kind: 'json', mode: 'default' },
  tree: { kind: 'json', mode: 'tree' },
  'tree-menu': { kind: 'json', mode: 'tree', state: 'menu' },
  raw: { kind: 'json', mode: 'raw' },
  hex: { kind: 'json', mode: 'hex' },
  code: { kind: 'code', mode: 'default' },
  formatting: { kind: 'code', mode: 'default', state: 'busy' },
  limited: { kind: 'limited', mode: 'default' },
  'format-off': { kind: 'limited', mode: 'default', state: 'format-off' },
  image: { kind: 'image', mode: 'default' },
  'image-large': { kind: 'image-large', mode: 'default' },
  binary: { kind: 'binary', mode: 'default' },
  form: { kind: 'form', mode: 'default' },
  md: { kind: 'md', mode: 'default' },
  'md-split': { kind: 'md', mode: 'split' },
  'md-source': { kind: 'md', mode: 'source' },
  media: { kind: 'media', mode: 'default' },
};

/** Selects the capture row implied by the current scene + body kind. */
function syncCaptureRowSelection() {
  const rows = [...app.querySelectorAll('.list-scroll .row')];
  if (!rows.length) return;
  const scene = app.dataset.scene || 'http';
  const kind = app.dataset.bodyKind || 'json';
  const target = (scene !== 'http' && rows.find((row) => row.dataset.captureRow === scene))
    || rows.find((row) => row.dataset.body === kind)
    || rows.find((row) => row.dataset.captureRow === 'http');
  rows.forEach((row) => row.classList.toggle('sel', row === target));
}

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
    boot: app.dataset.boot || 'none',
    upstream: app.dataset.upstream || 'none',
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
  const targets = [
    { selector: '.citem', ctx: 'composer-item' },
    { selector: '.cgrp-h', ctx: 'composer-folder' },
    { selector: '.rrule', ctx: 'rules-rule' },
    { selector: '.rgrp-h', ctx: 'rules-folder' },
  ];
  for (const target of targets) {
    const row = e.target.closest(target.selector);
    if (!row) continue;
    e.preventDefault();
    openTreeMenu(target.ctx, { x: e.clientX, y: e.clientY });
    return;
  }
  setState({ ctxmenu: '' });
});

// 目录行尾的 more 按钮开同一个菜单。
app.addEventListener('click', (e) => {
  const more = e.target.closest('.cgrp-more, .rgrp-more');
  if (!more) return;
  e.stopPropagation();
  const isComposer = more.classList.contains('cgrp-more');
  const row = more.closest(isComposer ? '.cgrp-h' : '.rgrp-h');
  const rect = more.getBoundingClientRect();
  app.querySelectorAll('.menuopen').forEach((r) => r.classList.remove('menuopen'));
  row.classList.add('menuopen');
  openTreeMenu(isComposer ? 'composer-folder' : 'rules-folder', { x: rect.left, y: rect.bottom + 4 });
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

// Rules tree: chevron collapses the folder, the switch enables, the row selects.
app.addEventListener('click', (e) => {
  const toggle = e.target.closest('.rtree .sw');
  if (toggle) return toggle.classList.toggle('on');
  const collapse = e.target.closest('.rgrp-chevbtn');
  if (collapse) return collapse.closest('.rgrp').classList.toggle('on');
  const rule = e.target.closest('.rrule');
  if (rule) app.querySelectorAll('.rrule').forEach((row) => row.classList.toggle('sel', row === rule));
});

// 树拖拽，VS Code 式：整行可拖，点击还是拖拽交给浏览器判定。
// 行被切成四段，上下两段是「插到前/后」，中间两段是「移进目录」。
// Rules 与 Composer 共用这一套，差别只有 class 名。
function installTreeDrag({ tree, rowSelector, folderRowClass, groupClass, groupBodyClass }) {
  if (!tree) return;
  const dropLine = document.createElement('div');
  dropLine.className = 'rdrop';
  let dragNode = null; // 正在移动的叶子行，或整个目录
  let drop = null; // { parent, before } 表示重排，{ folder } 表示移进目录
  let autoExpandRow = null;
  let autoExpandTimer = 0;

  // 目录行代表整个 section，拖它就要把子树一起带走。
  const nodeOf = (row) => (row.classList.contains(folderRowClass) ? row.closest(`.${groupClass}`) : row);
  const clampSector = (ratio) => Math.min(3, Math.max(0, Math.floor(ratio / 0.25)));
  const indentOf = (row) => parseFloat(getComputedStyle(row).paddingLeft);

  // 目录最多三层，再深规则内容就窄得没法读了。
  const MAX_FOLDER_DEPTH = 3;
  const fitsDepth = (parentDepth) => parentDepth + subtreeHeight(dragNode) <= MAX_FOLDER_DEPTH;

  function folderDepth(element) {
    let depth = 0;
    for (let node = element; node && node !== tree; node = node.parentElement) {
      if (node.classList.contains(groupClass)) depth += 1;
    }
    return depth;
  }

  function subtreeHeight(node) {
    if (!node || !node.classList.contains(groupClass)) return 0;
    const children = [...node.querySelector(`.${groupBodyClass}`).children].filter((child) => child.classList.contains(groupClass));
    return 1 + children.reduce((deepest, child) => Math.max(deepest, subtreeHeight(child)), 0);
  }

  // 行与行之间的空隙也归某一行，所以按指针 Y 找目标而不是按事件源——否则悬在空隙上谁都命中不了。
  function rowAt(clientY) {
    for (const row of tree.querySelectorAll(rowSelector)) {
      if (!row.offsetParent) continue;
      const rect = row.getBoundingClientRect();
      if (clientY < rect.bottom) return { row, rect };
    }
    return null;
  }

  function showDropLine(node, after, indent) {
    const treeRect = tree.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    // 线从目标行的内容起点画起，缩进本身就表达了落点深度。
    dropLine.style.top = `${(after ? rect.bottom : rect.top) - treeRect.top + tree.scrollTop - 1}px`;
    dropLine.style.left = `${rect.left - treeRect.left + indent}px`;
    dropLine.style.width = `${rect.width - indent}px`;
    tree.appendChild(dropLine);
  }

  function showRootDrop() {
    const nodes = [...tree.children].filter((child) => child !== dropLine && child.matches(`.${groupClass}, ${rowSelector}`));
    const last = nodes[nodes.length - 1];
    if (!last || last === dragNode || !fitsDepth(0)) return;
    drop = { parent: tree, before: null };
    const anchorRow = last.classList.contains(groupClass) ? last.querySelector(`.${folderRowClass}`) : last;
    showDropLine(last, true, indentOf(anchorRow));
  }

  // 悬停折叠目录会把它展开，这样不用先点开再拖进去。
  function scheduleAutoExpand(row, group) {
    if (autoExpandRow === row) return;
    clearTimeout(autoExpandTimer);
    autoExpandRow = row;
    if (group.classList.contains('on')) return;
    autoExpandTimer = setTimeout(() => group.classList.add('on'), 500);
  }

  function clearDropFeedback() {
    drop = null;
    dropLine.remove();
    tree.querySelectorAll('.droptarget').forEach((row) => row.classList.remove('droptarget'));
  }

  function finishDrag() {
    clearTimeout(autoExpandTimer);
    autoExpandRow = null;
    if (dragNode) {
      dragNode.classList.remove('dragsource');
      if (dragNode.dataset.reopen) dragNode.classList.add('on');
      delete dragNode.dataset.reopen;
    }
    dragNode = null;
    clearDropFeedback();
  }

  tree.addEventListener('dragstart', (e) => {
    const row = e.target.closest(rowSelector);
    if (!row) return;
    dragNode = nodeOf(row);
    dragNode.classList.add('dragsource');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    // 拖动中折叠自己，列表不跳动，自己的子节点也就不会成为落点。
    if (dragNode.classList.contains(groupClass)) {
      dragNode.dataset.reopen = dragNode.classList.contains('on') ? '1' : '';
      dragNode.classList.remove('on');
    }
  });

  tree.addEventListener('dragover', (e) => {
    if (!dragNode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropFeedback();

    const hit = rowAt(e.clientY);
    // 最后一行之下是列表的空尾巴，那就是根层级。
    if (!hit) return showRootDrop();

    const node = nodeOf(hit.row);
    // 只禁止拖进自己的子树；拖到祖先目录是合法的「移到上级」。
    if (node === dragNode || dragNode.contains(node)) return;

    const sector = clampSector((e.clientY - hit.rect.top) / hit.rect.height);
    if (hit.row.classList.contains(folderRowClass) && sector > 0 && sector < 3) {
      if (!fitsDepth(folderDepth(node))) return;
      hit.row.classList.add('droptarget');
      drop = { folder: node };
      scheduleAutoExpand(hit.row, node);
      return;
    }
    const parent = node.parentElement;
    if (!fitsDepth(folderDepth(parent))) return;
    // 「插到 N 之后」统一规约成「插到 N+1 之前」，相邻两行才共用一条线、不会闪。
    drop = { parent, before: sector < 2 ? node : node.nextElementSibling };
    showDropLine(node, sector >= 2, indentOf(hit.row));
  });

  tree.addEventListener('drop', (e) => {
    if (!dragNode || !drop) return;
    e.preventDefault();
    if (drop.folder) {
      drop.folder.querySelector(`.${groupBodyClass}`).appendChild(dragNode);
      drop.folder.classList.add('on');
      dragNode.dataset.reopen = '1';
    } else {
      drop.parent.insertBefore(dragNode, drop.before);
    }
    finishDrag();
  });

  tree.addEventListener('dragend', finishDrag);
}

installTreeDrag({
  tree: app.querySelector('.rtree'),
  rowSelector: '.rrule, .rgrp-h',
  folderRowClass: 'rgrp-h',
  groupClass: 'rgrp',
  groupBodyClass: 'rgrp-b',
});

installTreeDrag({
  tree: app.querySelector('.ccol-scroll'),
  rowSelector: '.citem, .cgrp-h',
  folderRowClass: 'cgrp-h',
  groupClass: 'cgrp',
  groupBodyClass: 'cgrp-b',
});

// Composer: collection tree, document tabs, request/response tabs and the send phase.
app.addEventListener('click', (e) => {
  if (e.target.closest('.ccol-toggle')) {
    return setState({ collection: app.dataset.collection === 'closed' ? 'open' : 'closed' });
  }
  const collapse = e.target.closest('.cgrp-chevbtn');
  if (collapse) return collapse.closest('.cgrp').classList.toggle('on');
  const folderName = e.target.closest('.cgrp-namebtn');
  if (folderName) {
    const row = folderName.closest('.cgrp-h');
    app.querySelectorAll('.cgrp-h.on').forEach((other) => other.classList.remove('on'));
    row.classList.add('on');
    return;
  }
  const saved = e.target.closest('.citem');
  if (saved) {
    app.querySelectorAll('.citem').forEach((row) => row.classList.toggle('on', row === saved));
    return;
  }
  const requestTab = e.target.closest('[data-tabs="creq"] > span');
  if (requestTab) return setComposerTab(requestTab.dataset.ctab);
  const responseTab = e.target.closest('[data-tabs="cresp"] > span');
  if (responseTab) return setComposerResponseTab(responseTab.dataset.crtab);
  const doc = e.target.closest('.cdoc');
  if (doc) {
    app.querySelectorAll('.cdoc').forEach((d) => d.classList.toggle('on', d === doc));
    return;
  }
  const bodyType = e.target.closest('.bodytype span');
  if (bodyType) return setBodyType(bodyType.dataset.bt);
  if (e.target.closest('.chist-trigger')) {
    return setState({ composerHistory: app.dataset.composerHistory === 'open' ? '' : 'open' });
  }
  if (e.target.closest('.cdoc-add')) return setState({ composer: 'empty' });
  if (e.target.closest('.csend')) return setState({ composer: '' });
});

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
  // Body format switch: the Segmented only changes the view mode, never the selected request.
  const bodyMode = e.target.closest('.bodybar .seg span[data-mode]');
  if (bodyMode) {
    return setState({ bodyMode: bodyMode.dataset.mode });
  }
  // Clicking a captured request opens the detail pane and loads that row's body type.
  const row = e.target.closest('.list-scroll .row');
  if (row) {
    app.classList.remove('nodetail');
    const scene = row.dataset.captureRow === 'http' ? '' : row.dataset.captureRow || '';
    const body = row.dataset.body || '';
    return setState({
      scene,
      bodyPreview: body || 'json',
      tab: scene === 'tunnel' ? 'tunnel'
        : scene === 'websocket' ? 'messages'
        : scene === 'grpc' ? 'grpc'
        : body ? 'response' : 'headers',
    });
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
  if (e.target.closest('[data-open-https]')) return setState({ overlay: 'https-setup' });
  if (e.target.closest('[data-body-full]')) return setState({ overlay: 'body-full' });
  if (e.target.closest('[data-close-overlay]')) return setState({ overlay: '' });
  // Inspector 分组折叠：整个标题行都是命中区，chevron 只是提示。
  const sectionHead = e.target.closest('.sec > .sh');
  if (sectionHead) return sectionHead.parentElement.classList.toggle('collapsed');
});


// 树搜索：命中叶子就留下它和它的祖先目录，命中目录名则整棵子树保留。
// 搜索期间目录强制展开，退出搜索恢复原来的展开状态。
function installTreeSearch({ input, tree, groupClass, rowSelector, nameSelector }) {
  if (!input || !tree) return;
  const empty = tree.querySelector('.searchempty');

  // 高亮会改写名字节点，所以原文只在第一次读到时留一份底稿
  const nameOf = (node) => node.querySelector(nameSelector);
  const rawText = (element) => {
    if (element.dataset.raw === undefined) element.dataset.raw = element.textContent;
    return element.dataset.raw;
  };
  const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function paint(node, keyword) {
    const element = nameOf(node);
    if (!element) return false;
    const text = rawText(element);
    const index = keyword ? text.toLowerCase().indexOf(keyword) : -1;
    if (index === -1) {
      if (element.innerHTML !== text) element.textContent = text;
      return false;
    }
    const before = escapeHtml(text.slice(0, index));
    const hit = escapeHtml(text.slice(index, index + keyword.length));
    const after = escapeHtml(text.slice(index + keyword.length));
    element.innerHTML = `${before}<mark class="searchhit">${hit}</mark>${after}`;
    return true;
  }

  input.addEventListener('input', () => {
    const keyword = input.value.trim().toLowerCase();
    const groups = [...tree.querySelectorAll(`.${groupClass}`)];
    const rows = [...tree.querySelectorAll(rowSelector)];
    const heads = groups.map((group) => group.querySelector(`.${groupClass}-h`) ?? group.firstElementChild);

    if (!keyword) {
      [...groups, ...rows].forEach((node) => node.classList.remove('searchhidden'));
      [...rows, ...heads].forEach((node) => paint(node, ''));
      groups.forEach((group) => {
        if (group.dataset.wasopen === undefined) return;
        group.classList.toggle('on', group.dataset.wasopen === '1');
        delete group.dataset.wasopen;
      });
      empty?.classList.remove('on');
      return;
    }

    groups.forEach((group) => {
      if (group.dataset.wasopen === undefined) group.dataset.wasopen = group.classList.contains('on') ? '1' : '';
    });

    let hits = 0;

    rows.forEach((row) => {
      const hit = paint(row, keyword);
      if (hit) hits += 1;
      row.classList.toggle('searchhidden', !hit);
    });

    // 目录：自己命中、或子孙里还有可见行，就留下
    [...groups].reverse().forEach((group, index) => {
      const head = heads[groups.length - 1 - index];
      const selfHit = paint(head, keyword);
      const childVisible = [...group.querySelectorAll(`${rowSelector}, .${groupClass}`)].some((node) => !node.classList.contains('searchhidden'));
      if (selfHit) {
        group.querySelectorAll(rowSelector).forEach((row) => row.classList.remove('searchhidden'));
        hits += 1;
      }
      group.classList.toggle('searchhidden', !selfHit && !childVisible);
      group.classList.add('on');
    });

    empty?.classList.toggle('on', hits === 0);
  });
}

installTreeSearch({
  input: app.querySelector('.rlbar .tree-search input'),
  tree: app.querySelector('.rtree'),
  groupClass: 'rgrp',
  rowSelector: '.rrule',
  nameSelector: '.rrule-n, .rgrp-n',
});

installTreeSearch({
  input: app.querySelector('.ccol-bar .tree-search input'),
  tree: app.querySelector('.ccol-scroll'),
  groupClass: 'cgrp',
  rowSelector: '.citem',
  nameSelector: '.citem-n, .cgrp-n',
});
// 目录菜单与右键菜单是同一个弹层：more 按钮落在按钮下方，右键落在指针处。
// 场景驱动没有指针位置，把菜单锚到对应树的第一个目录行下方。
function anchorMenuForScene(ctx) {
  const rows = {
    'composer-item': '.ccol-scroll .citem',
    'composer-folder': '.ccol-scroll .cgrp-h',
    'rules-rule': '.rtree .rrule',
    'rules-folder': '.rtree .rgrp-h',
  };
  const menu = app.querySelector(`.ctxmenu[data-ctx="${ctx}"]`);
  const row = app.querySelector(rows[ctx] ?? "");
  if (!menu || !row || menu.style.left) return;
  const bounds = app.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  menu.style.left = `${rect.right - bounds.left - 150}px`;
  menu.style.top = `${rect.bottom - bounds.top + 4}px`;
}

// 刚打开的那一瞬不算「点了外面」：同一次事件里后执行的关闭监听器会把它立即关掉。
let treeMenuJustOpened = false;

function openTreeMenu(ctx, anchor) {
  const menu = app.querySelector(`.ctxmenu[data-ctx="${ctx}"]`);
  // 先落到左上角再显示，量到真实尺寸后才能把落点收进窗口
  menu.style.left = '0px';
  menu.style.top = '0px';
  treeMenuJustOpened = true;
  setTimeout(() => { treeMenuJustOpened = false; }, 0);
  setState({ ctxmenu: ctx });
  const bounds = app.getBoundingClientRect();
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(6, Math.min(anchor.x - bounds.left, bounds.width - rect.width - 6))}px`;
  menu.style.top = `${Math.max(6, Math.min(anchor.y - bounds.top, bounds.height - rect.height - 6))}px`;
}

app.addEventListener('click', () => {
  if (!app.dataset.ctxmenu || treeMenuJustOpened) return;
  app.querySelectorAll('.menuopen').forEach((r) => r.classList.remove('menuopen'));
  setState({ ctxmenu: '' });
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
