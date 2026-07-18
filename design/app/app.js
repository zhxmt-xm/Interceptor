// Interceptor design SPA — state controller.
// The whole prototype is driven by window.__setState({view,theme,sidebar,overlay,step,tab,pop}).
// - Humans click the sidebar / floating controls; state + DOM update live.
// - The screenshot pipeline (shoot.mjs) calls __setState then captures .app.
const app = document.querySelector('.app');

// Unified sidebar. Active item follows data-view. first-run/import-export are overlays,
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

// first-run wizard step progress.
const STEP_ORDER = ['welcome', 'proxy', 'ca', 'ready'];
function paintSteps() {
  const ci = STEP_ORDER.indexOf(app.dataset.step || 'ca');
  app.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('done', i < ci);
    el.classList.toggle('cur', i === ci);
    const n = el.querySelector('.snum');
    if (n) n.innerHTML = i < ci ? '<svg><use href="#i-check"/></svg>' : String(i + 1);
  });
  app.querySelectorAll('.sline').forEach((el, i) => el.classList.toggle('done', i < ci));
}

// Inspector (capture) tab switching.
function setInspTab(tab) {
  app.querySelectorAll('[data-tabs="insp"] > span').forEach((s) => s.classList.toggle('on', s.dataset.tab === tab));
  app.querySelectorAll('.tp[data-tab]').forEach((p) => p.classList.toggle('on', p.dataset.tab === tab));
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
    if (!s.scene) app.dataset.scene = 'http';
    if (!s.tab) setInspTab('headers');
  }
  if (s.scene) {
    app.dataset.scene = s.scene;
    app.querySelectorAll('[data-capture-row]').forEach((row) =>
      row.classList.toggle('sel', row.dataset.captureRow === s.scene),
    );
  }
  if (s.pop) app.classList.add('showpop');
  if ('pop2' in s) {
    app.classList.remove('thopen', 'lgopen');
    if (s.pop2 === 'theme') app.classList.add('thopen');
    else if (s.pop2 === 'lang') app.classList.add('lgopen');
  }
  if (s.tab) setInspTab(s.tab);
  if (s.settings) app.dataset.settings = s.settings;
  if (s.repair) app.dataset.repair = s.repair;
  if (s.update) app.dataset.update = s.update;
  if ('overlay' in s) {
    if (s.overlay) app.setAttribute('data-overlay', s.overlay);
    else app.removeAttribute('data-overlay');
  }
  if (s.step) {
    app.setAttribute('data-step', s.step);
    paintSteps();
  }
  // Re-render the sidebar whenever anything affecting the footer switchers changes.
  if (!s.view && (s.theme || s.sidebar || s.lang)) {
    renderSidebar(app.getAttribute('data-view'));
  }
  positionFootpop();
  syncControls();
}
window.__setState = setState;

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
    step: app.getAttribute('data-step') || 'ca',
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
  if (e.target.closest('.fbtn') || e.target.closest('#addaction')) {
    app.classList.toggle('showpop');
  }
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

// Initial paint.
app.dataset.lang = app.dataset.lang || 'en';
renderSidebar(app.getAttribute('data-view') || 'capture');
paintSteps();
syncControls();
