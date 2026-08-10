// Drives the same interaction on both design SPAs and diffs the resulting DOM state.
// Selector coverage only proves a handler exists; this proves it behaves the same.
// Run from repo root:  node design-vite/tools/interaction-parity.mjs [--only=<id fragment>]
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { startDesignPreview } from './design-preview.mjs';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const nextRoot = path.dirname(toolsDir);
const legacyEntry = path.resolve(nextRoot, '..', 'design', 'app', 'index.html');
const only = process.argv.find((argument) => argument.startsWith('--only='))?.split('=')[1];

// Every scenario starts here so no dataset key is left over from the previous one.
// breakpointBody is pinned because the design SPA fakes body loading on a 3s timer.
const BASELINE = {
  view: 'capture', theme: 'light', sidebar: 'collapsed', overlay: '', detail: '',
  tab: 'headers', scene: 'http', filters: 'open', collection: 'open', search: '',
  bodyType: 'json', bodyMode: 'default', bodyKind: 'json', settings: 'certificates',
  breakpoints: 'on', breakpointState: '', breakpointBody: 'ready', breakpointFile: 'none',
  breakpointPanel: '', breakpointNotice: '', lang: 'en', pop: '', pop2: '',
  fileMenu: '', ctxmenu: '', transfer: '', https: 'fresh', mitm: 'inactive',
  tlsCompatibility: '', update: 'up-to-date', githubAuth: 'signed-in',
};

const CAPTURE = { view: 'capture', theme: 'light', sidebar: 'collapsed', overlay: '' };const RULES = { view: 'rules', theme: 'light', sidebar: 'expanded', overlay: '' };
const COMPOSER = { view: 'composer', theme: 'light', sidebar: 'expanded', overlay: '' };
const SETTINGS = { view: 'settings', theme: 'light', sidebar: 'expanded', overlay: '', settings: 'certificates' };
const DETAIL = { ...CAPTURE, detail: 'open' };
const BREAK = { ...CAPTURE, detail: 'open', breakpoints: 'on', breakpointState: 'request' };

/** [id, state, click sequence, legacy handler it exercises] — the handler keeps coverage auditable. */
const SCENARIOS = [
  ['shell/sidebar-toggle', CAPTURE, ['.header-sidebar-toggle-v2'], '.header-sidebar-toggle-v2'],
  ['shell/theme-trigger', CAPTURE, ['[data-thtrigger]'], '[data-thtrigger]'],
  ['shell/theme-set', CAPTURE, ['[data-thtrigger]', '[data-themeset="dark"]'], '[data-themeset]'],
  ['shell/lang-trigger', CAPTURE, ['[data-lgtrigger]'], '[data-lgtrigger]'],
  ['shell/lang-set', CAPTURE, ['[data-lgtrigger]', '[data-langset="ja"]'], '[data-langset]'],
  ['shell/dock-toggles', RULES, ['.mtoggles'], '.mtoggles'],
  ['shell/dock-group', RULES, ['.mtg'], '.mtg'],

  ['capture/filters-toggle', { ...CAPTURE, filters: 'open' }, ['.cfilters-toggle'], '.cfilters-toggle'],
  ['capture/recording', CAPTURE, ['.rec'], '.rec'],
  ['capture/row-select', CAPTURE, ['.list-scroll .row:nth-of-type(3)'], '.list-scroll .row'],
  ['capture/facet-select', { ...CAPTURE, filters: 'open' }, ['.fgrp[data-grp="application"] .fitem:nth-of-type(2)'], '.fitem'],
  ['capture/facet-group-toggle', { ...CAPTURE, filters: 'open' }, ['.fgrp[data-grp="protocol"] .fgrp-toggle'], '.fgrp-toggle'],
  ['capture/facet-group-clear', { ...CAPTURE, filters: 'open' }, ['.fgrp[data-grp="application"] .fitem:nth-of-type(2)', { hover: '.fgrp[data-grp="application"] .fgrp-h' }, '.fgrp[data-grp="application"] .fgrp-clear'], '.fgrp-clear'],
  ['capture/filters-clear-all', { ...CAPTURE, filters: 'open' }, ['.fgrp[data-grp="application"] .fitem:nth-of-type(2)', '.cfilters-clear'], '.cfilters-clear'],
  ['capture/omni-clear', { ...CAPTURE, filters: 'open', search: 'api' }, ['.omni-clear'], '.omni-clear'],
  ['capture/file-trigger', CAPTURE, ['[data-file-trigger]'], '[data-file-trigger]'],
  ['capture/open-https', { ...DETAIL, scene: 'tunnel', tab: 'tunnel' }, ['[data-open-https]'], '[data-open-https]'],
  ['capture/close-overlay', { ...CAPTURE, overlay: 'https-setup' }, ['[data-close-overlay]'], '[data-close-overlay]'],
  ['capture/inspector-tab', DETAIL, ['[data-tabs="insp"] > span:nth-of-type(2)'], 'insp tabs'],
  ['capture/inspector-close', DETAIL, ['.insp .iclose:visible'], '.iclose'],
  ['capture/section-collapse', DETAIL, ['.sec > .sh'], '.sec > .sh'],
  ['capture/body-mode', { ...DETAIL, tab: 'response' }, ['.bodybar .seg span[data-mode]:nth-of-type(2)'], '.bodybar .seg span[data-mode]'],
  ['capture/body-full', { ...DETAIL, tab: 'request' }, ['[data-body-full]'], '[data-body-full]'],
  ['capture/rule-link', DETAIL, ['[data-rule-link]'], '[data-rule-link]'],
  ['capture/request-menu', { ...CAPTURE, requestMenu: 'open' }, ['[data-breakpoint-trigger]'], '[data-breakpoint-trigger]'],
  ['capture/request-menu-item', { ...CAPTURE, requestMenu: 'open' }, ['.request-rule-menu .fi'], '.request-rule-menu .fi'],
  ['capture/breakpoint-submenu', { ...CAPTURE, requestMenu: 'breakpoint' }, ['.breakpoint-submenu .fi'], '.breakpoint-submenu .fi'],

  ['breakpoint/open-manager', CAPTURE, ['.breakctl'], '.breakctl'],
  ['breakpoint/manager-close', CAPTURE, ['.breakctl', '.break-manager-close'], '.break-manager-close'],
  ['breakpoint/global-toggle', CAPTURE, ['.breakctl', '.break-global-toggle'], '.break-global-toggle'],
  ['breakpoint/rule-toggle', CAPTURE, ['.breakctl', '.break-rule-toggle'], '.break-rule-toggle'],
  ['breakpoint/manager-rule', CAPTURE, ['.breakctl', '.break-manager-rule'], '.break-manager-rule'],
  ['breakpoint/rule-open', CAPTURE, ['.breakctl', '.break-rule-open'], '.break-rule-open'],
  ['breakpoint/custom', CAPTURE, ['.breakctl', '.break-manager [data-breakpoint-custom]'], '[data-breakpoint-custom]'],
  ['breakpoint/section-head', BREAK, ['.break-section-head'], '.break-section-head'],
  ['breakpoint/replace-mode', BREAK, ['[data-replace-mode="text"]'], '[data-replace-mode]'],
  ['breakpoint/file-upload', { ...BREAK, breakpointBody: 'file' }, ['.break-file-upload-empty'], '.break-file-upload-empty'],
  ['breakpoint/file-remove', { ...BREAK, breakpointBody: 'file', breakpointFile: 'valid' }, ['.break-file-remove'], '.break-file-remove'],
  ['breakpoint/foot-drop', BREAK, ['.break-foot .btn'], '.break-foot .btn'],
  ['breakpoint/armed-undo', { ...CAPTURE, breakpointNotice: 'armed' }, ['.break-armed-undo'], '.break-armed-undo'],
  ['breakpoint/armed-open', { ...CAPTURE, breakpointNotice: 'armed' }, ['.break-armed-open'], '.break-armed-open'],

  ['rules/tree-select', RULES, ['.rtree .rrule'], '.rrule'],
  ['rules/folder-head', RULES, ['.rtree .rgrp-h'], '.rgrp-h'],
  ['rules/folder-chevron', RULES, ['.rtree .rgrp-chevbtn'], '.rgrp-chevbtn'],
  ['rules/folder-name', RULES, ['.rtree .rgrp-namebtn'], '.rgrp-namebtn'],
  ['rules/rule-switch', RULES, ['.rtree .sw'], '.rtree .sw'],
  ['rules/folder-more', RULES, [{ hover: '.rtree .rgrp-h' }, '.rgrp-more'], '.rgrp-more'],
  ['rules/add-action', RULES, ['#addaction'], '#addaction'],
  ['rules/rule-select-trigger', RULES, ['[data-rule-select-trigger]'], '[data-rule-select-trigger]'],
  ['rules/show-requests', RULES, ['[data-show-rule-requests]'], '[data-show-rule-requests]'],

  ['composer/collection-toggle', COMPOSER, ['.ccol-toggle'], '.ccol-toggle'],
  ['composer/item-select', COMPOSER, ['.ccol-scroll .citem'], '.citem'],
  ['composer/folder-head', COMPOSER, ['.ccol-scroll .cgrp-h'], '.cgrp-h'],
  ['composer/folder-chevron', COMPOSER, ['.ccol-scroll .cgrp-chevbtn'], '.cgrp-chevbtn'],
  ['composer/folder-name', COMPOSER, ['.ccol-scroll .cgrp-namebtn'], '.cgrp-namebtn'],
  ['composer/folder-more', COMPOSER, [{ hover: '.ccol-scroll .cgrp-h' }, '.cgrp-more'], '.cgrp-more'],
  ['composer/doc-tab', COMPOSER, ['.cdoc'], '.cdoc'],
  ['composer/doc-add', COMPOSER, ['.cdoc-add'], '.cdoc-add'],
  ['composer/body-type', { ...COMPOSER, composerTab: 'body' }, ['.bodytype span:nth-of-type(2)'], '.bodytype span'],
  ['composer/history', COMPOSER, ['.chist-trigger'], '.chist-trigger'],
  ['composer/send', COMPOSER, ['.csend'], '.csend'],

  ['settings/nav', SETTINGS, ['[data-settings-nav="proxy"]'], '[data-settings-nav]'],
  ['settings/control', { ...SETTINGS, settings: 'proxy' }, ['.sctl'], '.sctl'],
  ['settings/github-auth', { ...SETTINGS, settings: 'updates', githubAuth: 'signed-out' }, ['[data-github-auth-action]'], '[data-github-auth-action]'],
  ['settings/appcontainer-refresh', { ...SETTINGS, settings: 'app-containers', appContainers: 'ready' }, ['[data-app-container-refresh]'], '[data-app-container-refresh]'],
  ['settings/appcontainer-toggle', { ...SETTINGS, settings: 'app-containers', appContainers: 'ready' }, ['[data-app-container-toggle]'], '[data-app-container-toggle]'],
  ['settings/appcontainer-confirm', { ...SETTINGS, settings: 'app-containers', appContainers: 'ready', overlay: 'app-container-confirm' }, ['[data-app-container-confirm]'], '[data-app-container-confirm]'],
  ['settings/tls-add', { ...SETTINGS, settings: 'tls-passthrough', tlsPassthrough: 'ready' }, ['[data-tls-host-add]'], '[data-tls-host-add]'],
  ['settings/tls-remove', { ...SETTINGS, settings: 'tls-passthrough', tlsPassthrough: 'ready' }, ['[data-tls-host-remove]'], '[data-tls-host-remove]'],
  ['settings/tls-compat-dismiss', { ...SETTINGS, settings: 'tls-passthrough', overlay: 'tls-compatibility' }, ['[data-tls-compatibility-dismiss]'], '[data-tls-compatibility-dismiss]'],
  ['settings/tls-compat-add', { ...SETTINGS, settings: 'tls-passthrough', overlay: 'tls-compatibility' }, ['[data-tls-compatibility-add-dialog]'], '[data-tls-compatibility-add-dialog]'],
];

/** Broad enough that a lost selection class shows up, stable enough to avoid animation noise. */
const READ_STATE = () => {
  const app = document.querySelector('.app');
  const mark = (className) => [...document.querySelectorAll(`.${className}`)]
    .map((element) => `${element.tagName}.${[...element.classList].sort().join('.')}`);
  return {
    dataset: { ...app.dataset },
    // Class order carries no meaning and differs between the two renderers.
    shell: [...app.classList].sort().join(' '),
    on: mark('on'),
    sel: mark('sel'),
    closed: mark('closed'),
    applied: mark('applied'),
  };
};

async function drive(page, scenario) {
  const [, state, steps] = scenario;
  // Clicks leave DOM state that __setState does not own, and a selector missing on one side
  // would desync the two runs for good. Reload so every scenario starts from the same page.
  await page.reload({ waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => typeof window.__setState === 'function', null, { timeout: 60_000 });
  await page.addStyleTag({ content: STABILIZE });
  await page.evaluate((next) => window.__setState(next), { ...BASELINE, ...state });
  await page.waitForTimeout(120);
  for (const step of steps) {
    // Some controls only reveal themselves on hover, so a hover step is a first-class action.
    if (typeof step === 'object') {
      await page.locator(step.hover).first().hover({ timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(80);
      continue;
    }
    const target = page.locator(step).first();
    if (await target.count() === 0) return { missingSelector: step };
    try {
      await target.click({ force: true, timeout: 4000 });
    } catch (error) {
      return { clickFailed: step, message: String(error).split('\n')[0] };
    }
    await page.waitForTimeout(120);
  }
  return page.evaluate(READ_STATE);
}

const STABILIZE = '*{transition:none!important;animation:none!important}';

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 920 } });
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => typeof window.__setState === 'function', null, { timeout: 60_000 });
  await page.addStyleTag({ content: STABILIZE });
  return page;
}

const designPreview = await startDesignPreview(nextRoot);
const browser = await chromium.launch({ channel: 'msedge' });
const legacyPage = await openPage(browser, pathToFileURL(legacyEntry).href);
const nextPage = await openPage(browser, designPreview.url);

const selected = only ? SCENARIOS.filter(([id]) => id.includes(only)) : SCENARIOS;
const failures = [];
const unusable = [];
for (const scenario of selected) {
  const [id, , , handler] = scenario;
  const legacy = await drive(legacyPage, scenario);
  const next = await drive(nextPage, scenario);
  const same = JSON.stringify(legacy) === JSON.stringify(next);
  // A scenario whose selector never resolves silently asserts nothing, so it is not a pass.
  const broken = Boolean(legacy.missingSelector || legacy.clickFailed);
  if (broken) unusable.push({ id, handler, legacy });
  else if (!same) failures.push({ id, handler, legacy, next });
  console.log(`${broken ? 'SKIP' : same ? 'OK  ' : 'DIFF'}  ${id}`);
}

/** Reports only the keys that differ; dumping whole snapshots buries the signal. */
function describeDifference(legacy, next) {
  const lines = [];
  const keys = new Set([...Object.keys(legacy), ...Object.keys(next)]);
  for (const key of keys) {
    const left = legacy[key];
    const right = next[key];
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    if (left && right && typeof left === 'object' && !Array.isArray(left)) {
      for (const inner of new Set([...Object.keys(left), ...Object.keys(right)])) {
        if (JSON.stringify(left[inner]) === JSON.stringify(right[inner])) continue;
        lines.push(`  ${key}.${inner}: legacy=${JSON.stringify(left[inner])} next=${JSON.stringify(right[inner])}`);
      }
      continue;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const onlyLegacy = left.filter((entry) => !right.includes(entry));
      const onlyNext = right.filter((entry) => !left.includes(entry));
      lines.push(`  ${key}: ${left.length} vs ${right.length}; -${JSON.stringify(onlyLegacy.slice(0, 4))} +${JSON.stringify(onlyNext.slice(0, 4))}`);
      continue;
    }
    lines.push(`  ${key}: legacy=${JSON.stringify(left)} next=${JSON.stringify(right)}`);
  }
  return lines.join('\n');
}

for (const failure of failures) {
  console.log(`\n--- DIFF ${failure.id}  (${failure.handler})`);
  console.log(describeDifference(failure.legacy, failure.next));
}
for (const entry of unusable) {
  console.log(`\n--- SKIP ${entry.id}  (${entry.handler}): ${JSON.stringify(entry.legacy)}`);
}

await browser.close();
await designPreview.close();
console.log(`\n${selected.length - failures.length - unusable.length}/${selected.length} match; ${failures.length} differ; ${unusable.length} unusable`);
if (failures.length || unusable.length) process.exitCode = 1;
