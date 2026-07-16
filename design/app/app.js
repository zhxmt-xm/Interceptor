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

function renderSidebar(active) {
  const side = app.querySelector('.side');
  const item = (it) =>
    `<div class="nav${it.id === active ? ' on' : ''}" data-nav="${it.id}"><svg><use href="#${it.icon}"/></svg><span class="txt">${it.label}</span></div>`;

  // Footer theme + language switchers (design exploration; variant chosen by dock).
  const theme = app.getAttribute('data-theme') || 'light';
  const lang = app.dataset.lang || 'en';
  const themeui = app.dataset.themeui || 'a';
  const langui = app.dataset.langui || 'l1';
  const collapsed = app.classList.contains('collapsed');
  // Four themes read as one day: warm=dawn · light=noon · ember=dusk · dark=night.
  const themeIcon = { warm: 'i-sunrise', light: 'i-sun', ember: 'i-sunset', dark: 'i-moon' }[theme];
  const langCode = { en: 'EN', zh: '中', ja: 'あ', de: 'DE' }[lang];
  const langName = { en: 'English', zh: '简体中文', ja: '日本語', de: 'Deutsch' }[lang];
  const themeIcons = ['i-sunrise', 'i-sun', 'i-sunset', 'i-moon'];
  const themes = ['warm', 'light', 'ember', 'dark'];

  // segmented (B) can't fit the 60px rail → fall back to the single cycle icon.
  const eff = collapsed && themeui === 'b' ? 'd' : themeui;
  let themeCtl;
  if (eff === 'a')
    themeCtl = `<div class="nav thtrigger" data-thtrigger><svg><use href="#${themeIcon}"/></svg><span class="txt">Theme</span><span class="thdot"></span></div>`;
  else if (eff === 'b')
    themeCtl = `<div class="thseg" data-thseg>${themes.map((t, i) => `<span data-themeset="${t}" class="${theme === t ? 'on' : ''}"><svg><use href="#${themeIcons[i]}"/></svg></span>`).join('')}</div>`;
  else if (eff === 'c')
    themeCtl = `<div class="nav thsw"><svg><use href="#i-palette"/></svg><span class="txt">Theme</span>${themes.map((t) => `<span class="tsw s-${t} ${theme === t ? 'on' : ''}" data-themeset="${t}"></span>`).join('')}</div>`;
  else
    themeCtl = `<div class="nav thcyc" data-thcycle><svg><use href="#${themeIcon}"/></svg><span class="txt">Theme</span></div>`;

  let langCtl;
  if (langui === 'l1')
    langCtl = `<div class="nav lgtrigger" data-lgtrigger><svg><use href="#i-globe"/></svg><span class="txt">Language</span><span class="lgcode">${langCode}</span></div>`;
  else if (langui === 'l2')
    langCtl = `<div class="lgchip" data-lgtrigger><svg><use href="#i-globe"/></svg><span>${langCode}</span><span class="cx"><svg><use href="#i-chev"/></svg></span></div>`;
  else
    langCtl = `<div class="nav lgrow" data-lgtrigger><svg><use href="#i-globe"/></svg><span class="txt">Language</span><span class="lgval">${langName}</span><span class="cx"><svg><use href="#i-chev"/></svg></span></div>`;

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
  if (s.themeui) app.dataset.themeui = s.themeui;
  if (s.langui) app.dataset.langui = s.langui;
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
  if ('overlay' in s) {
    if (s.overlay) app.setAttribute('data-overlay', s.overlay);
    else app.removeAttribute('data-overlay');
  }
  if (s.step) {
    app.setAttribute('data-step', s.step);
    paintSteps();
  }
  // Re-render the sidebar whenever anything affecting the footer switchers changes.
  if (!s.view && (s.theme || s.sidebar || s.themeui || s.langui || s.lang)) {
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
    themeui: app.dataset.themeui || 'a',
    langui: app.dataset.langui || 'l1',
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

// Inspector tab clicks.
app.querySelectorAll('[data-tabs="insp"] > span').forEach((s) =>
  s.addEventListener('click', () => setInspTab(s.dataset.tab)),
);

// Footer switchers: theme popover/segmented/swatch/cycle + language popover (design exploration).
app.addEventListener('click', (e) => {
  const tset = e.target.closest('[data-themeset]');
  if (tset) return setState({ theme: tset.dataset.themeset });
  const lset = e.target.closest('[data-langset]');
  if (lset) return setState({ lang: lset.dataset.langset, pop2: '' });
  if (e.target.closest('[data-thcycle]')) {
    const order = ['warm', 'light', 'ember', 'dark'];
    const cur = app.getAttribute('data-theme') || 'light';
    return setState({ theme: order[(order.indexOf(cur) + 1) % order.length] });
  }
  if (e.target.closest('[data-thtrigger]'))
    return setState({ pop2: app.classList.contains('thopen') ? '' : 'theme' });
  if (e.target.closest('[data-lgtrigger]'))
    return setState({ pop2: app.classList.contains('lgopen') ? '' : 'lang' });
});

// Initial paint.
app.dataset.themeui = app.dataset.themeui || 'a';
app.dataset.langui = app.dataset.langui || 'l1';
app.dataset.lang = app.dataset.lang || 'en';
renderSidebar(app.getAttribute('data-view') || 'capture');
paintSteps();
syncControls();
