// Design-parity harness. Renderer state is established through a fake Preload API and
// normal user interactions; product code contains no parity-only data or navigation hooks.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright-core';
import { expect } from '@playwright/test';
import { createLogger, createServer } from 'vite';

import { startDesignPreview } from '../../../../design-vite/tools/design-preview.mjs';
import { describeReadonlyBody, describeLimitedCaptureBody } from '../../../../design-vite/src/fixtures/readonlyBodyData.ts';
import * as config from './parity.config.mjs';
import { createReadableReport } from './report.mjs';
import {
  fakeInterceptorFixture,
  installFakeInterceptor,
} from './fake-interceptor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(here, '../../../..');
const designRoot = path.join(repoRoot, 'design-vite');

const defaultOutDir = path.join(desktopRoot, 'test-results/visual-parity');
const STYLE_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'color'];
const STATE_KEYS = ['disabled', 'checked', 'selected', 'expanded', 'pressed', 'focused', 'value'];
const SCROLL_KEYS = ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight', 'scrollLeft', 'scrollTop'];
const closingPages = new WeakSet();

async function capturePageDiagnostics(page, side, report, currentView) {
  const stage = `${side}-page`;
  const recordError = message => {
    if (closingPages.has(page)) return;
    const errors = (currentView() ?? report).errors;
    if (!errors.some(error => error.stage === stage && error.message === message)) {
      errors.push({ stage, message });
    }
  };
  page.on('pageerror', error => recordError(error.message));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type())) return;
    (currentView() ?? report).logs.push({
      side, level: message.type(), message: message.text(), location: message.location(),
    });
  });
  await page.exposeBinding('__parityReportBrowserError', (_source, error) => recordError(error.message));
  await page.addInitScript(() => {
    window.addEventListener('error', event => {
      // Browser diagnostics such as ResizeObserver errors have no JavaScript exception.
      if (event.error == null && event.message) {
        void window.__parityReportBrowserError({ message: event.message });
      }
    });
  });
}

async function rendererStyleSources(page) {
  return page.evaluateHandle(() => {
    const entries = [];
    for (const style of document.querySelectorAll('style[data-vite-dev-id]')) {
      const file = style.getAttribute('data-vite-dev-id')?.split('?')[0];
      if (!file?.replaceAll('\\', '/').includes('/src/renderer/') || !file.endsWith('.module.css')) continue;
      const visit = rules => {
        for (const rule of rules) {
          if (rule.selectorText) {
            const classes = [...rule.selectorText.matchAll(/\.([_a-zA-Z][\w-]*)/g)].map(match => match[1]);
            if (classes.length) {
              let supported = true;
              try {
                document.documentElement.matches(rule.selectorText);
              } catch (error) {
                if (error.name !== 'SyntaxError') throw error;
                supported = false;
              }
              if (supported) entries.push({ file, selector: rule.selectorText, classes });
            }
          }
          if (rule.cssRules) visit(rule.cssRules);
        }
      };
      if (style.sheet) visit(style.sheet.cssRules);
    }
    return entries;
  });
}

async function collect(page, rootSelector, targets, side, designReference, sourceRules = null) {
  const result = {};
  for (const target of targets) {
    const name = typeof target === 'string' ? target : target.name;
    const definition = typeof target === 'string' ? {} : target;
    const handles = [];
    try {
      const selector = definition[`${side}Selector`];
      const textElements = typeof target === 'string'
        ? await page.getByText(name, { exact: true }).elementHandles() : [];
      const buttons = typeof target === 'string'
        ? await page.getByRole('button', { name, exact: true }).elementHandles() : [];
      const elements = typeof target === 'string' ? [] : await page.locator(
        selector ?? `[data-parity="${definition.parity}"]`,
      ).elementHandles();
      handles.push(...textElements, ...buttons, ...elements);
      result[name] = await waitForPageTask(page.evaluate(async (input) => {
        const rendered = (element) => element.isConnected && element.getClientRects().length > 0
          && getComputedStyle(element).visibility !== 'hidden'
          && getComputedStyle(element).display !== 'none';
        const visible = (element) => {
          const rect = element.getBoundingClientRect();
          return rendered(element) && rect.width > 0 && rect.height > 0;
        };
        const roots = [...document.querySelectorAll(input.rootSelector)].filter(visible);
        if (roots.length !== 1) throw new Error(`Expected one visible content root, found ${roots.length}`);
        const expectedPresent = input.definition.present !== false;
        const expectedVisible = input.definition.visible !== false;
        let candidates = input.elements;
        if (input.textTarget) {
          candidates = input.textElements.filter(visible).map((element) => {
            const button = element.closest('button,[role="button"]');
            if (input.side === 'app') return input.designButton ? button : element;
            return button?.textContent?.trim() === input.name ? button : element;
          }).filter(Boolean);
          if (!candidates.length && (input.side === 'design' || input.designButton)) {
            candidates = input.buttons.filter(visible);
          }
        } else if (expectedPresent && expectedVisible) {
          candidates = candidates.filter(rendered);
        }
        candidates = [...new Set(candidates)];
        if (!expectedPresent) {
          return { status: 'ready', state: { present: candidates.length > 0 }, matches: candidates.length };
        }
        if (candidates.length !== 1) {
          return { status: candidates.length ? 'ambiguous' : 'missing', matches: candidates.length };
        }
        const element = candidates[0];
        const sourceStyles = () => {
          if (!input.sourceRules) return [];
          const filesFor = owner => {
            const classes = new Set(owner.classList);
            return input.sourceRules.filter(rule =>
              rule.classes.some(name => classes.has(name)) && owner.matches(rule.selector),
            ).map(rule => rule.file);
          };
          for (let owner = element; owner; owner = owner.parentElement) {
            const files = filesFor(owner);
            if (files.length) return [...new Set(files)];
          }
          // A portal shell can be library-owned while its nearest content is a product component.
          let children = [...element.children];
          while (children.length) {
            const files = children.flatMap(filesFor);
            if (files.length) return [...new Set(files)];
            children = children.flatMap(child => [...child.children]);
          }
          return [];
        };
        const stateKeys = input.definition.stateKeys ?? [];
        const stateSelectors = input.definition.stateSelectors ?? {};
        const measure = () => {
          if (!element.isConnected) throw new Error('Target detached during measurement');
          const state = { present: true, visible: visible(element) };
          for (const key of new Set([...stateKeys, ...Object.keys(stateSelectors)])) {
            const stateSelector = stateSelectors[key]?.[input.side];
            if (stateSelector) {
              state[key] = element.matches(stateSelector);
            } else if (key === 'focused') {
              state[key] = element === document.activeElement || element.contains(document.activeElement);
            } else if (key === 'value') {
              if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
                || element instanceof HTMLSelectElement)) {
                throw new Error('State value requires an input, textarea or select');
              }
              state[key] = element.value;
            } else if ((key === 'disabled' || key === 'checked' || key === 'selected')
              && typeof element[key] === 'boolean') {
              state[key] = element[key];
            } else {
              const value = element.getAttribute(`aria-${key}`);
              if (value === null) throw new Error(`State ${key} has no DOM/ARIA value; declare a stateSelector`);
              state[key] = value === 'true' ? true : value === 'false' ? false : value;
            }
          }
          const origin = roots[0].getBoundingClientRect();
          let rect = element.getBoundingClientRect();
          if (input.definition.measureText === true) {
            const range = document.createRange();
            range.selectNodeContents(element);
            rect = range.getBoundingClientRect();
          }
          const computed = getComputedStyle(element);
          const style = {};
          for (const key of input.styleKeys) {
            if (!(key in computed) || typeof computed[key] !== 'string' || computed[key] === '') {
              throw new Error(`Unknown or unavailable computed style: ${key}`);
            }
            style[key] = computed[key];
          }
          const measurement = {
            state,
            style,
          };
          if (element.getClientRects().length) {
            measurement.geometry = { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
          }
          if (input.definition.compareText === true) measurement.text = element.innerText ?? element.textContent;
          if (input.definition.scroll === true) {
            measurement.scroll = Object.fromEntries(input.scrollKeys.map(key => [key, element[key]]));
          }
          return measurement;
        };
        const first = measure();
        let previous = first;
        let current = first;
        const deadline = performance.now() + 2_000;
        while (performance.now() < deadline) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          current = measure();
          if (JSON.stringify(previous) === JSON.stringify(current)) {
            return {
              status: 'ready', button: element.matches('button,[role="button"]'), matches: 1,
              sourceStyles: sourceStyles(), ...current,
            };
          }
          previous = current;
        }
        return { status: 'unstable', first, last: current, matches: 1 };
      }, {
        rootSelector, name, definition, side, textTarget: typeof target === 'string',
        designButton: designReference?.[name]?.button === true,
        textElements, buttons, elements,
        styleKeys: definition.styleKeys ?? STYLE_KEYS, scrollKeys: SCROLL_KEYS, sourceRules,
      }), `Measure ${side}/${name}`, 5_000);
    } catch (error) {
      result[name] = { status: 'error', message: errorMessage(error) };
    } finally {
      for (const handle of handles) await handle.dispose();
    }
  }
  return result;
}

function compareTargets(view, design, app, result) {
  for (const target of view.targets) {
    const name = typeof target === 'string' ? target : target.name;
    const definition = typeof target === 'string' ? {} : target;
    const expected = design[name];
    const actual = app[name];
    const styleFiles = (actual.sourceStyles ?? []).map(file => path.relative(repoRoot, file).split(path.sep).join('/'))
      .filter(file => file.startsWith('apps/desktop/src/renderer/') && file.endsWith('.module.css'));
    const add = (kind, property, expectedValue, actualValue, extra = {}) => {
      result.issues.push({
        view: view.id, theme: view.theme, target: name, kind, property,
        expected: expectedValue, actual: actualValue, styleFiles, ...extra,
      });
    };
    for (const [side, sample] of [['design', expected], ['renderer', actual]]) {
      if (sample.status !== 'ready') {
        add(sample.status, 'measurement', 'one stable measurable target', sample, { side });
      }
    }
    if (expected.status !== 'ready' || actual.status !== 'ready') continue;
    result.checked += 1;
    for (const [side, sample] of [['design', expected], ['renderer', actual]]) {
      const expectations = {
        present: definition.present !== false,
        ...(definition.present === false ? {} : { visible: definition.visible !== false }),
      };
      for (const [key, value] of Object.entries(expectations)) {
        if (sample.state[key] !== value) add('state', key, value, sample.state[key], { side });
      }
    }
    for (const group of ['geometry', 'style', 'state', 'scroll']) {
      const keys = new Set([...Object.keys(expected[group] ?? {}), ...Object.keys(actual[group] ?? {})]);
      for (const key of keys) {
        const left = expected[group]?.[key];
        const right = actual[group]?.[key];
        if (left !== right) {
          add(group, key, left ?? null, right ?? null,
            typeof left === 'number' && typeof right === 'number' ? { delta: right - left } : {});
        }
      }
    }
    if (definition.compareText && expected.text !== actual.text) add('text', 'content', expected.text, actual.text);
  }
}

async function readSceneConditions(page, rootSelector, view, viewport, side) {
  const conditions = await waitForPageTask(page.evaluate(({ rootSelector, side }) => {
    const roots = [...document.querySelectorAll(rootSelector)].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== 'none';
    });
    if (roots.length !== 1) throw new Error(`Expected one content canvas, found ${roots.length}`);
    const root = roots[0];
    const rect = root.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio },
      canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      theme: side === 'design' ? root.dataset.theme : document.documentElement.dataset.theme,
      sidebar: side === 'design'
        ? root.classList.contains('collapsed') ? 'collapsed' : 'expanded'
        : root.dataset.collapsed === 'true' ? 'collapsed' : 'expanded',
    };
  }, { rootSelector, side }), `${side} scene conditions`, 5_000);
  const checks = [
    ['viewport', { ...viewport, deviceScaleFactor: 2 }],
    ['theme', view.theme],
    ...(view.designState.sidebar ? [['sidebar', view.designState.sidebar]] : []),
  ];
  // Explicit Renderer viewport overrides remain diagnostics against the fixed design canvas.
  if (side === 'design' || (viewport.width === config.viewport.width && viewport.height === config.viewport.height)) {
    checks.push(['canvas', { x: 0, y: 0, ...viewport }]);
  }
  const differences = checks.filter(([key, expected]) => JSON.stringify(conditions[key]) !== JSON.stringify(expected))
    .map(([key, expected]) => `${key}：预期 ${JSON.stringify(expected)}，实际 ${JSON.stringify(conditions[key])}`);
  if (differences.length) {
    throw new Error(`${side === 'design' ? '设计稿' : 'Renderer'}场景条件不一致；${differences.join('；')}`);
  }
  return conditions;
}

async function applyRendererActions(page, actions = [], side = 'renderer') {
  for (const action of actions) {
    const index = action.index ?? 0;
    switch (action.type) {
      case 'clickText':
        await page.getByText(action.text, { exact: true }).nth(index).click();
        break;
      case 'clickSelector':
        await page.locator(action.selector).filter({ visible: true }).nth(index).click();
        break;
      case 'clickAutomation':
        await page
          .locator(`[data-automation-id="${action.automationId}"]`)
          .filter({ visible: true })
          .nth(index)
          .click();
        break;
      case 'contextMenuText':
        await page.getByText(action.text, { exact: true }).nth(index).click({ button: 'right' });
        break;
      case 'hoverText':
        await page.getByText(action.text, { exact: true }).filter({ visible: true }).nth(index).hover();
        break;
      case 'hoverSelector':
        await page.locator(action.selector).filter({ visible: true }).nth(index).hover();
        break;
      case 'mouseOverSelector':
        await page.locator(action.selector).nth(index).dispatchEvent('mouseover');
        break;
      case 'contextMenuSelector':
        await page.locator(action.selector).filter({ visible: true }).nth(index)
          .click({ button: 'right', position: action.position });
        break;
      case 'assertTextHidden':
        await page.getByText(action.text, { exact: true }).first().waitFor({
          state: 'hidden',
          timeout: 2_000,
        });
        break;
      case 'assertInsideViewport':
        await expect.poll(() => page.locator(action.selector).filter({ visible: true }).evaluateAll((elements) => ({
          visible: elements.length > 0,
          outside: elements.flatMap(element => {
            const rect = element.getBoundingClientRect();
            return rect.top < 0 || rect.left < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight
              ? [rect.toJSON()] : [];
          }),
        })), {
          message: `${side === 'design' ? '设计稿' : 'Renderer'}弹层未正确定位到可视区域：${action.selector}`,
          timeout: 5_000,
        })
          .toEqual({ visible: true, outside: [] });
        break;
      case 'assertSelectorVisible':
        await page.locator(action.selector).waitFor({ state: 'visible' });
        break;
      case 'assertInputValue':
        await expect(page.locator(action.selector)).toHaveValue(action.value);
        break;
      case 'clickRole':
        await page.getByRole(action.role, { name: action.name, exact: true }).nth(index).click();
        break;
      case 'fillLabel':
        await page.getByLabel(action.label, { exact: true }).filter({ visible: true }).nth(index).fill(action.value);
        break;
      case 'pressLabel':
        await page.getByLabel(action.label, { exact: true }).filter({ visible: true }).nth(index).press(action.key);
        break;
      case 'typeLabel':
        await page.getByLabel(action.label, { exact: true }).filter({ visible: true }).nth(index).pressSequentially(action.value);
        break;
      case 'fillAutomation':
        await page
          .locator(`[data-automation-id="${action.automationId}"]`)
          .filter({ visible: true })
          .nth(index)
          .fill(action.value);
        break;
      case 'resizeVertical': {
        const control = page.locator(action.selector).filter({ visible: true }).nth(index);
        await control.hover();
        const box = await control.boundingBox();
        if (!box) throw new Error('The resizable body is not visible.');
        const start = { x: box.x + box.width - 3, y: box.y + box.height - 3 };
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x, start.y + action.delta, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        break;
      }
      case 'emitTlsCompatibility':
        await page.evaluate((events) => {
          window.__emitTlsCompatibility?.(events);
        }, action.events);
        break;
      case 'emitCaptureEvents':
        await page.evaluate((count) => {
          const startedAt = Date.now();
          window.__emitCaptureEvents?.(Array.from({ length: count }, (_value, index) => ({
            kind: 'exchange-added',
            summary: {
              id: `menu-persistence-${index}`,
              method: 'GET',
              secure: true,
              host: 'events.example.com',
              path: `/stream/${index}`,
              protocol: 'h2',
              statusCode: 200,
              responseMime: 'application/json',
              state: 'completed',
              startedAt: startedAt + index,
              durationMs: 10,
              requestBytes: 0,
              responseBytes: 32,
            },
          })));
        }, action.count);
        break;
      case 'selectLabel':
        {
          const control = page.getByLabel(action.label, { exact: true }).nth(index);
          const tagName = await control.evaluate((element) => element.tagName);
          if (tagName === 'SELECT') {
            await control.selectOption(action.value);
          } else {
            await control.focus();
            await control.press('ArrowDown');
            await control.press('ArrowDown');
            await control.press('Enter');
          }
        }
        break;
      default:
        throw new Error(`Unknown Renderer parity action: ${action.type}`);
    }
  }
}

async function runViews(views, options, report) {
  const rendererViewport = options.viewport;
  const inspectPopover = options.inspectPopover;
  const inspectSelect = options.inspectSelect;
  let browser = null;
  let designSession = null;
  let appContext = null;
  let currentViewResult = null;
  const url = options.rendererUrl;
  const abortBrowser = () => {
    if (browser) void closeResource('interrupted browser', () => browser.close(), report.errors);
  };

  async function openDesignPage() {
    if (!browser || !options.designUrl) {
      throw new Error('Visual parity resources are not initialized.');
    }
    const context = await browser.newContext({
      viewport: config.viewport,
      deviceScaleFactor: 2,
      colorScheme: 'light',
    });
    const page = await context.newPage();
    await capturePageDiagnostics(page, 'design', report, () => currentViewResult);
    // Monaco spins its workers up through blob URLs, so `networkidle` never settles once the
    // design page carries more than a couple of editors; wait for the same readiness flag
    // shoot.mjs uses instead.
    await page.goto(options.designUrl, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => window.__monacoReady === true, null, { timeout: 120_000 });
    await waitForPageTask(page.evaluate(async () => {
      const fonts = [
        ...[400, 450, 500, 600, 700].map(weight => `${weight} 12px "Inter"`),
        ...[400, 500, 600].map(weight => `${weight} 12px "JetBrains Mono"`),
      ];
      for (const font of fonts) {
        const faces = await document.fonts.load(font, 'Interceptor');
        if (faces.length === 0 || faces.some(face => face.status !== 'loaded')) {
          throw new Error(`Design font unavailable: ${font}`);
        }
      }
      window.__monacoRelayout?.();
    }), 'Design fonts');
    await page.addStyleTag({
      content: '.app{border:0!important;border-radius:0!important;box-shadow:none!important}body{padding:0!important;align-items:flex-start!important;justify-content:flex-start!important}.dock{display:none!important}',
    });
    return { context, page };
  }

  try {
    options.signal.throwIfAborted();
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server'] });
    options.signal.addEventListener('abort', abortBrowser, { once: true });
    options.signal.throwIfAborted();
    report.browser = browser.version();
    designSession = await openDesignPage();
    let designPage = designSession.page;
    let designPageViewCount = 0;
    let previousDesignState = null;

    for (const view of views) {
      options.signal.throwIfAborted();
      if (!options.batchChild) console.log(`正在检查 ${view.id}（${report.views.length + 1}/${views.length}）`);
      const result = {
        id: view.id, feature: view.designState.view, theme: view.theme, targets: view.targets.length,
        checked: 0, issues: [], errors: [], logs: [], conditions: {},
      };
      report.views.push(result);
      currentViewResult = result;
      let stage = 'design-scene';
      try {
        if (designPageViewCount === 24 || previousDesignState?.tlsPatterns
          || (view.freshDesign === true && designPageViewCount > 0)) {
          await closeContext(designSession.context, 'design context', result.errors);
          designSession = await openDesignPage();
          designPage = designSession.page;
          designPageViewCount = 0;
        }
        designPageViewCount += 1;
        previousDesignState = view.designState;
        await designPage.emulateMedia({ colorScheme: view.theme === 'dark' ? 'dark' : 'light' });
        await designPage.evaluate((state) => window.__setState?.({
          overlay: '',
          fileMenu: '',
          settings: 'certificates',
          update: 'up-to-date',
          mitm: 'inactive',
          tlsPatterns: null,
          requestMenu: '',
          ruleFilter: '',
          bodyPreview: '',
          bodyRuleEffect: '',
          breakpoints: 'on',
          breakpointState: '',
          breakpointBody: 'loading',
          breakpointFile: 'none',
          bodyRemainderSample: 'current',
          bodyRemainderNotice: 'none',
          breakpointPanel: '',
          breakpointMessage: '',
          breakpointQueueSelection: 'http-head',
          breakpointQueueMenu: '',
          websocketBreakpoint: 'disabled',
          websocketMessagesState: 'ready',
          agentPanel: 'closed',
          agentProvider: 'configured',
          agentProviderDialog: '',
          agentProviderDialogMode: 'add',
          agentProviderDialogTarget: '',
          agentModelMenu: '',
          agentDefaultModel: 'deepseek',
          agentCurrentModel: 'deepseek',
          agentChat: 'checkout',
          agentChatDialog: '',
          agentChatMenu: '',
          agentMessage: '',
          agentTurnState: 'idle',
          agentUsagePanel: '',
          agentRemoveModelTarget: '',
          agentRemovedModels: [],
          agentAddedProfile: null,
          agentToolSearch: '',
          agentDisabledTools: [],
          mcpDisabledTools: [],
          mcpServerState: 'disabled',
          mcpEndpointAssigned: false,
          mcpClientLabel: '',
          mcpClientExecutionMode: 'ask',
          mcpClientDialog: '',
          mcpConfigCopied: false,
          mcpCredentialGeneration: 0,
          mcpToolApproval: '',
          ...state,
        }), view.designState);
        await waitForPageTask(designPage.evaluate(() => document.fonts.ready), 'Design font readiness');
        await applyRendererActions(designPage, view.designActions, 'design');
        await designPage.waitForTimeout(400);
        result.conditions.design = await readSceneConditions(designPage, '.app', view, config.viewport, 'design');

        stage = 'renderer-scene';
        appContext = await browser.newContext({
          viewport: rendererViewport,
          deviceScaleFactor: 2,
          colorScheme: view.theme === 'dark' ? 'dark' : 'light',
        });
        const appPage = await appContext.newPage();
        await capturePageDiagnostics(appPage, 'renderer', report, () => result);
        await appPage.addInitScript(installFakeInterceptor, {
          fixture: fakeInterceptorFixture,
          theme: view.theme,
          captureSessionIds: view.captureSessionIds ?? null,
          freshProfile: view.freshProfile === true,
          largeBody: view.largeBody === true,
          largeTextBody: view.largeTextBody === true,
          readonlyData: view.readonlyData
            ? describeReadonlyBody(view.readonlyData.sample, view.readonlyData.notice)
            : view.largeTextBody ? describeLimitedCaptureBody() : null,
          noRuleHits: view.noRuleHits === true,
          pausedBreakpoints: view.pausedBreakpoints === true,
          pausedBreakpointPhase: view.pausedBreakpointPhase ?? null,
          pausedWebSocketBreakpoint: view.pausedWebSocketBreakpoint === true,
          websocketMessagesState: view.websocketMessagesState ?? 'ready',
          grpcMessageSource: view.grpcMessageSource ?? null,
          breakpointBodyState: view.breakpointBodyState ?? 'request-ready',
          breakpointFile: view.breakpointFile ?? null,
          breakpointsEnabled: view.breakpointsEnabled !== false,
          breakpointManagerRules: view.breakpointManagerRules === true,
          mitmActive: view.mitmActive !== false,
          updateState: view.updateState ?? 'unsupported',
          agentModels: view.agentModels ?? 'empty',
          agentSessionState: view.agentSessionState ?? 'completed',
          agentMessage: view.agentMessage ?? null,
          mcpState: view.mcpState ?? 'disabled',
          mcpClientConfigured: view.mcpClientConfigured === true,
          mcpApproval: view.mcpApproval === true,
          proxyReady: view.proxyReady !== false,
          proxyEnableFails: view.proxyEnableFails === true,
          upstreamDown: view.upstreamDown === true,
          upstreamSettings: view.upstreamSettings ?? { mode: 'system' },
          upstreamApplyFails: view.upstreamApplyFails === true,
          upstreamApplyDelayMs: view.upstreamApplyDelayMs ?? 0,
          tlsCompatibilityEvents: view.tlsCompatibilityEvents ?? [],
          tlsPassthroughHosts: view.tlsPassthroughHosts ?? null,
          tlsTunnelHost: view.tlsTunnelHost ?? null,
          bodyRuleEffect: view.bodyRuleEffect ?? null,
          fileOperationDelayMs: view.fileOperationDelayMs ?? 0,
          storageUsage: view.storageUsage ?? null,
          storageUnavailable: view.storageUnavailable === true,
        });
        await appPage.goto(url, { waitUntil: 'networkidle' });
        await appPage.locator('[data-collapsed]').first().waitFor({ state: 'visible' });
        await appPage.waitForLoadState('networkidle');
        await waitForPageTask(appPage.evaluate(() => document.fonts.ready), 'Renderer font readiness');

        if (view.rendererNav) {
          await appPage
            .getByRole('navigation', { name: 'Workspaces' })
            .getByRole('button', { name: view.rendererNav, exact: true })
            .click();
        }
        await applyRendererActions(appPage, view.rendererActions);
        await appPage.waitForTimeout(400);
        await ensurePageFonts(appPage);
        result.conditions.renderer = await readSceneConditions(appPage, '[data-collapsed]', view, rendererViewport, 'renderer');

        if (inspectPopover) {
          const popover = appPage.locator('.ant-popover:visible').last();
          if (await popover.count()) {
            const diagnostics = await popover.evaluate((node) => {
              const container = node.querySelector('.ant-popover-container');
              const rect = node.getBoundingClientRect();
              const containerRect = container?.getBoundingClientRect();
              const content = container?.querySelector('.ant-popover-content');
              const groups = container
                ? [...container.querySelectorAll('div')]
                    .filter((element) => {
                      const text = element.textContent?.trim();
                      return text && text === text.toUpperCase();
                    })
                    .map((element) => ({
                      text: element.textContent?.trim(),
                      height: element.getBoundingClientRect().height,
                    }))
                : [];
              const menuItems = container
                ? [...container.querySelectorAll('button')].map((element) => ({
                    text: element.textContent,
                    height: element.getBoundingClientRect().height,
                  }))
                : [];
              return {
                className: node.className,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                container: container && containerRect
                  ? {
                      y: containerRect.y,
                      height: containerRect.height,
                      clientHeight: container.clientHeight,
                      scrollHeight: container.scrollHeight,
                      overflowY: getComputedStyle(container).overflowY,
                    }
                  : null,
                contentHeight: content?.getBoundingClientRect().height ?? null,
                groups,
                menuItems,
              };
            });
            const trigger = await appPage
              .getByRole('button', { name: 'Add action', exact: true })
              .boundingBox();
            console.log('  弹层诊断', JSON.stringify({ viewport: rendererViewport, trigger, ...diagnostics }));
          }
        }

        if (inspectSelect) {
          const dropdown = appPage.locator('.ant-select-dropdown:visible').last();
          if (await dropdown.count()) {
            const diagnostics = await dropdown.evaluate((node) => {
              const list = node.querySelector('[role="listbox"]');
              const holder = node.querySelector('.rc-virtual-list-holder');
              const content = node.querySelector('.rc-virtual-list-holder-inner');
              const rect = node.getBoundingClientRect();
              return {
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                list: list
                  ? {
                      clientHeight: list.clientHeight,
                      scrollHeight: list.scrollHeight,
                      overflowY: getComputedStyle(list).overflowY,
                    }
                  : null,
                holder: holder
                  ? {
                      clientHeight: holder.clientHeight,
                      scrollHeight: holder.scrollHeight,
                      overflowY: getComputedStyle(holder).overflowY,
                    }
                  : null,
                contentHeight: content?.getBoundingClientRect().height ?? null,
              };
            });
            console.log('  下拉框诊断', JSON.stringify({ viewport: rendererViewport, ...diagnostics }));
          }
        }

        stage = 'comparison';
        const design = await collect(designPage, '.app', view.targets, 'design');
        const sourceRules = await rendererStyleSources(appPage);
        try {
          const app = await collect(appPage, '[data-collapsed]', view.targets, 'app', design, sourceRules);
          compareTargets(view, design, app, result);
        } finally {
          await sourceRules.dispose();
        }
      } catch (error) {
        result.errors.push({ stage, message: errorMessage(error) });
        designPageViewCount = 24;
      } finally {
        if (appContext) {
          await closeContext(appContext, 'renderer context', result.errors);
          appContext = null;
        }
        if (result.errors.length) designPageViewCount = 24;
        currentViewResult = null;
      }
    }
  } catch (error) {
    report.errors.push({ stage: 'setup', message: errorMessage(error) });
  } finally {
    options.signal.removeEventListener('abort', abortBrowser);
    if (designSession) await closeContext(designSession.context, 'design context', report.errors);
    if (browser) await closeResource('browser', () => browser.close(), report.errors);
  }
}

async function ensurePageFonts(page) {
  await waitForPageTask(page.evaluate(async () => {
    await document.fonts.ready;
    const fonts = new Set([...document.querySelectorAll('body *')]
      .filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
      .map(element => {
        const style = getComputedStyle(element);
        return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      }));
    for (const font of fonts) {
      if (!/Inter|JetBrains/.test(font)) continue;
      const faces = await document.fonts.load(font, 'Interceptor');
      if (!faces.length || faces.some(face => face.status !== 'loaded')) {
        throw new Error(`Renderer font unavailable: ${font}`);
      }
    }
  }), 'Renderer fonts');
}

async function waitForPageTask(task, label, timeout = 30_000) {
  let timer;
  try {
    return await Promise.race([
      task,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not complete within ${timeout}ms`)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function closeContext(context, name, errors) {
  for (const page of context.pages()) {
    closingPages.add(page);
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
  }
  await closeResource(name, () => context.close(), errors);
}

async function closeResource(name, close, errors) {
  try {
    await close();
  } catch (error) {
    errors.push({ stage: 'cleanup', message: `${name}: ${errorMessage(error)}` });
  }
}

async function startPageServers(report) {
  let rendererServer = null;
  let designPreview = null;
  try {
    console.log('正在准备 Renderer 和独立设计预览…');
    const logger = createLogger('silent', { allowClearScreen: false });
    for (const method of ['warn', 'warnOnce', 'error']) {
      const original = logger[method].bind(logger);
      logger[method] = (message, loggerOptions) => {
        const entries = method === 'error' ? report.errors : report.warnings;
        if (!entries.some(entry => entry.stage === 'renderer-build' && entry.message === message)) {
          entries.push({ stage: 'renderer-build', message });
        }
        original(message, loggerOptions);
      };
    }
    rendererServer = await createServer({
      configFile: path.join(desktopRoot, 'vite.renderer.config.ts'),
      customLogger: logger,
      root: desktopRoot,
      server: { port: 5199, strictPort: true, forwardConsole: false },
      logLevel: 'warn',
    });
    await rendererServer.listen();
    const rendererUrl = rendererServer.resolvedUrls?.local?.[0];
    if (!rendererUrl) throw new Error('Renderer server did not expose a local URL');
    designPreview = await startDesignPreview(designRoot);
    console.log('页面已就绪，开始自动比较元素数据。');
    return { rendererServer, designPreview, rendererUrl, designUrl: designPreview.url };
  } catch (error) {
    if (designPreview) await closeResource('design preview', () => designPreview.close(), report.errors);
    if (rendererServer) await closeResource('renderer server', () => rendererServer.close(), report.errors);
    throw error;
  }
}

function errorMessage(error) {
  if (error instanceof AggregateError) {
    return `${error.message}: ${error.errors.map(errorMessage).join('; ')}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function selectViews(values) {
  const knownIds = new Set(config.views.map(view => view.id));
  if (knownIds.size !== config.views.length) throw new Error('Duplicate view IDs in parity configuration');
  const ids = values.view?.split(',');
  if (ids && (new Set(ids).size !== ids.length || ids.some(id => !knownIds.has(id)))) {
    throw new Error(`Unknown, empty or duplicate view: ${values.view}`);
  }
  let views = config.views.filter(view => !ids || ids.includes(view.id));
  if (values.slice !== undefined) {
    const match = values.slice.match(/^(\d+):(\d+)$/);
    if (!match) throw new Error('Invalid --slice; expected start:end');
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end || end > views.length) {
      throw new Error('Invalid or empty --slice range');
    }
    views = views.slice(start, end);
  }
  if (!views.length) throw new Error('No parity views selected');
  for (const view of views) {
    if (!Array.isArray(view.targets) || !view.targets.length) throw new Error(`No targets in ${view.id}`);
    const names = new Set();
    for (const target of view.targets) {
      const name = typeof target === 'string' ? target : target.name;
      if (typeof name !== 'string' || !name || names.has(name)) throw new Error(`Invalid or duplicate target in ${view.id}: ${name}`);
      names.add(name);
      if (typeof target === 'string') continue;
      if (!target.parity && (!target.designSelector || !target.appSelector)) {
        throw new Error(`Both selectors or a parity identifier are required: ${view.id}/${name}`);
      }
      for (const key of ['present', 'visible', 'measureText', 'compareText', 'scroll']) {
        if (target[key] !== undefined && typeof target[key] !== 'boolean') throw new Error(`Invalid ${key}: ${view.id}/${name}`);
      }
      for (const key of ['styleKeys', 'stateKeys']) {
        if (target[key] !== undefined && (!Array.isArray(target[key])
          || target[key].some(value => typeof value !== 'string' || !value))) {
          throw new Error(`Invalid ${key}: ${view.id}/${name}`);
        }
      }
      for (const state of [...(target.stateKeys ?? []), ...Object.keys(target.stateSelectors ?? {})]) {
        if (!STATE_KEYS.includes(state)) throw new Error(`Unknown state ${state}: ${view.id}/${name}`);
      }
      for (const selectors of Object.values(target.stateSelectors ?? {})) {
        if (!selectors || typeof selectors.design !== 'string' || !selectors.design
          || typeof selectors.app !== 'string' || !selectors.app) {
          throw new Error(`Both state selectors are required: ${view.id}/${name}`);
        }
      }
    }
  }
  return views;
}

function summarize(report) {
  const issues = report.views.flatMap(view => view.issues);
  const errors = [...report.errors, ...report.views.flatMap(view => view.errors)];
  const unrun = report.selectedViews.filter(id => !report.views.some(view => view.id === id));
  const summary = {
    selected: report.selectedViews.length, executed: report.views.length, unrun,
    targets: report.views.reduce((total, view) => total + view.targets, 0),
    checked: report.views.reduce((total, view) => total + view.checked, 0),
    issues: issues.length,
    differences: issues.filter(issue => ['geometry', 'style', 'state', 'text', 'scroll'].includes(issue.kind)).length,
    missing: issues.filter(issue => issue.kind === 'missing').length,
    ambiguous: issues.filter(issue => issue.kind === 'ambiguous').length,
    unstable: issues.filter(issue => issue.kind === 'unstable').length,
    errors: errors.length + issues.filter(issue => issue.kind === 'error').length,
  };
  summary.status = summary.errors || unrun.length || !summary.selected ? 'error'
    : issues.length || summary.checked !== summary.targets ? 'differences' : 'passed';
  return summary;
}

async function writeReports(report, options, print = true) {
  report.finishedAt = new Date().toISOString();
  report.summary = summarize(report);
  let readable;
  try {
    await mkdir(path.dirname(options.resultJsonPath), { recursive: true });
    await mkdir(path.dirname(options.reportPath), { recursive: true });
    readable = await createReadableReport(report, { ...options, repoRoot });
    await writeFile(options.resultJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(options.reportPath, readable.markdown, 'utf8');
  } catch (error) {
    report.errors.push({ stage: 'report', message: errorMessage(error) });
    report.summary = summarize(report);
    if (report.overview) report.overview.conclusion = '检查未完成';
    try {
      await writeFile(options.resultJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    } catch (jsonError) {
      throw new Error(`${errorMessage(error)}；错误报告也未能保存：${errorMessage(jsonError)}`);
    }
    throw error;
  }
  if (!print) return;
  for (const line of readable.consoleLines) console.log(line);
}

function runBatchProcess(args, signal) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot, stdio: ['ignore', 'inherit', 'pipe'], windowsHide: true, signal,
    });
    let stderr = '';
    let truncated = false;
    let error = null;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      const remaining = 65_536 - stderr.length;
      if (chunk.length > remaining) truncated = true;
      if (remaining > 0) stderr += chunk.slice(0, remaining);
    });
    child.once('error', failure => { error = failure; });
    child.once('close', (status, terminatedBy) => resolve({
      status, signal: terminatedBy, error,
      stderr: `${stderr}${truncated ? '\n[stderr truncated]' : ''}`,
    }));
  });
}

async function runBatches(views, options, report) {
  await mkdir(options.outDir, { recursive: true });
  const token = `${process.pid}-${Date.now()}`;
  for (let start = 0; start < views.length; start += 5) {
    options.signal.throwIfAborted();
    const batchViews = views.slice(start, start + 5);
    const resultJsonPath = path.join(options.outDir, `.parity-${token}-${start}.json`);
    const reportPath = path.join(options.outDir, `.parity-${token}-${start}.md`);
    console.log(`正在检查第 ${Math.floor(start / 5) + 1}/${Math.ceil(views.length / 5)} 批：场景 ${start + 1}-${start + batchViews.length}/${views.length}`);
    let result;
    try {
      result = await runBatchProcess([
        fileURLToPath(import.meta.url),
        `--view=${batchViews.map(view => view.id).join(',')}`, `--slice=0:${batchViews.length}`,
        `--result-json=${resultJsonPath}`, `--report=${reportPath}`,
        `--out-dir=${options.outDir}`,
        `--viewport=${options.viewport.width}x${options.viewport.height}`,
        `--renderer-url=${options.rendererUrl}`, `--design-url=${options.designUrl}`,
        ...(options.inspectPopover ? ['--inspect-popover'] : []),
        ...(options.inspectSelect ? ['--inspect-select'] : []),
      ], options.signal);
      if (result.error && result.error.code !== 'ABORT_ERR') throw result.error;
      if (result.signal) throw new Error(`Parity batch terminated by ${result.signal}`);
      const batch = JSON.parse(await readFile(resultJsonPath, 'utf8'));
      const ids = batchViews.map(view => view.id);
      if (batch.version !== 1 || JSON.stringify(batch.selectedViews) !== JSON.stringify(ids)
        || !Array.isArray(batch.views) || !Array.isArray(batch.errors) || !Array.isArray(batch.logs)
        || batch.views.some(view => !ids.includes(view.id) || !Array.isArray(view.issues) || !Array.isArray(view.errors) || !Array.isArray(view.logs)
          || !Number.isSafeInteger(view.checked) || !Number.isSafeInteger(view.targets)
          || view.checked < 0 || view.checked > view.targets
          || view.targets !== batchViews.find(expected => expected.id === view.id)?.targets.length)
        || new Set(batch.views.map(view => view.id)).size !== batch.views.length) {
        throw new Error('Invalid parity batch result');
      }
      const summary = summarize(batch);
      if (report.browser && batch.browser && report.browser !== batch.browser) throw new Error('Browser version changed between batches');
      if (batch.browser) report.browser = batch.browser;
      const expectedExit = summary.status === 'passed' ? 0 : summary.status === 'error' ? 2 : 1;
      if (!options.signal.aborted && result.status !== expectedExit) throw new Error(`Batch exit ${result.status} does not match report ${summary.status}: ${result.stderr}`);
      report.views.push(...batch.views);
      report.errors.push(...batch.errors);
      report.logs.push(...batch.logs);
      const progress = summarize(report);
      console.log(`进度 ${report.views.length}/${views.length}：${progress.errors ? '存在执行问题' : progress.issues ? '已发现差异' : '暂未发现差异'}`);
      if (batch.errors.length) break;
    } catch (error) {
      report.errors.push({ stage: 'batch', message: `${errorMessage(error)}${result?.stderr ? `\n${result.stderr.trim()}` : ''}` });
      break;
    } finally {
      await rm(resultJsonPath, { force: true });
      await rm(reportPath, { force: true });
    }
  }
}

async function main() {
  const report = {
    version: 1, startedAt: new Date().toISOString(), pid: process.pid,
    platform: process.platform, node: process.version,
    selectedViews: [], views: [], errors: [], warnings: [], logs: [],
  };
  const options = {
    outDir: defaultOutDir, reportPath: path.join(defaultOutDir, 'report.md'),
    resultJsonPath: path.join(defaultOutDir, 'report.json'), viewport: config.viewport,
    inspectPopover: false, inspectSelect: false,
  };
  const abortController = new AbortController();
  options.signal = abortController.signal;
  let interruptedBy = null;
  const interrupt = signal => {
    interruptedBy = signal;
    abortController.abort(new Error(`Interrupted by ${signal}`));
  };
  const interruptInt = () => interrupt('SIGINT');
  const interruptTerm = () => interrupt('SIGTERM');
  process.once('SIGINT', interruptInt);
  process.once('SIGTERM', interruptTerm);
  let servers = null;
  try {
    const { values } = parseArgs({
      options: {
        view: { type: 'string' }, slice: { type: 'string' }, viewport: { type: 'string' },
        'out-dir': { type: 'string' }, report: { type: 'string' }, 'result-json': { type: 'string' },
        'inspect-popover': { type: 'boolean' }, 'inspect-select': { type: 'boolean' },
        'renderer-url': { type: 'string' }, 'design-url': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    });
    if (values.help) {
      console.log('node apps/desktop/tests/visual-parity/parity.mjs [--view=id,id] [--out-dir=directory] [--report=file.md] [--result-json=file.json] [--viewport=1600x900]');
      console.log('独立严格比较元素数据，无需Agent或截图。退出码：0无差异，1存在差异，2执行错误，130/143中断。');
      return;
    }
    for (const key of ['out-dir', 'report', 'result-json']) {
      if (values[key] !== undefined && !values[key].trim()) throw new Error(`Empty --${key}`);
    }
    options.outDir = path.resolve(values['out-dir'] ?? defaultOutDir);
    options.reportPath = path.join(options.outDir, 'report.md');
    options.resultJsonPath = path.join(options.outDir, 'report.json');
    const reportPath = path.resolve(values.report ?? options.reportPath);
    const resultJsonPath = path.resolve(values['result-json'] ?? options.resultJsonPath);
    if (reportPath === resultJsonPath) throw new Error('JSON and Markdown reports need different paths');
    options.reportPath = reportPath;
    options.resultJsonPath = resultJsonPath;
    if (values.viewport !== undefined) {
      const match = values.viewport.match(/^([1-9]\d*)x([1-9]\d*)$/);
      if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))) {
        throw new Error('Invalid --viewport; expected positive widthxheight');
      }
      options.viewport = { width: Number(match[1]), height: Number(match[2]) };
    }
    options.inspectPopover = values['inspect-popover'] === true;
    options.inspectSelect = values['inspect-select'] === true;
    const views = selectViews(values);
    report.selectedViews = views.map(view => view.id);
    report.viewport = options.viewport;
    const batchUrlsProvided = values['renderer-url'] !== undefined || values['design-url'] !== undefined;
    options.batchChild = false;
    if (batchUrlsProvided) {
      if (values.slice === undefined || !values['renderer-url'] || !values['design-url']) {
        throw new Error('Batch server URLs require both loopback URLs and --slice');
      }
      for (const key of ['renderer-url', 'design-url']) {
        const url = new URL(values[key]);
        if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
          throw new Error(`Invalid internal batch URL: --${key}`);
        }
      }
      options.batchChild = true;
      options.rendererUrl = values['renderer-url'];
      options.designUrl = values['design-url'];
    } else {
      options.signal.throwIfAborted();
      servers = await startPageServers(report);
      options.rendererUrl = servers.rendererUrl;
      options.designUrl = servers.designUrl;
    }
    options.signal.throwIfAborted();
    if (!options.batchChild && views.length > 5) await runBatches(views, options, report);
    else await runViews(views, options, report);
    options.signal.throwIfAborted();
  } catch (error) {
    report.errors.push({ stage: 'configuration/execution', message: errorMessage(error) });
  } finally {
    if (servers) {
      await closeResource('design preview', () => servers.designPreview.close(), report.errors);
      await closeResource('renderer server', () => servers.rendererServer.close(), report.errors);
    }
    process.removeListener('SIGINT', interruptInt);
    process.removeListener('SIGTERM', interruptTerm);
  }
  await writeReports(report, options, !options.batchChild);
  process.exitCode = interruptedBy === 'SIGINT' ? 130 : interruptedBy === 'SIGTERM' ? 143
    : report.summary.status === 'passed' ? 0 : report.summary.status === 'error' ? 2 : 1;
}

try {
  await main();
} catch (error) {
  console.error(`[parity] 检查或报告生成失败：${errorMessage(error)}`);
  process.exitCode = 2;
}