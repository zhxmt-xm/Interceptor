import { useEffect, type RefObject } from 'react';

import type { DesignState, DesignStatePatch, TreeContextMenu, UpdateDesignState } from '../state/types';
import { BOOT_PHASES } from '../state/utils';
import { installTreeDrag, installTreeSearch } from './treeAdapter';

function closest(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

function setSelected(root: HTMLElement, selector: string, selected: Element | null, className = 'on'): void {
  root.querySelectorAll(selector).forEach((element) => element.classList.toggle(className, element === selected));
}

function setTab(root: HTMLElement, selector: string, paneSelector: string, datasetKey: string, value: string): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((tab) => tab.classList.toggle('on', tab.dataset[datasetKey] === value));
  root.querySelectorAll<HTMLElement>(paneSelector).forEach((pane) => pane.classList.toggle('on', pane.dataset[datasetKey] === value));
}

function currentTlsPatterns(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-tls-host-pattern]'))
    .map((row) => row.dataset.tlsHostPattern?.trim().toLowerCase() ?? '')
    .filter(Boolean)
    .sort();
}

function validTlsHostPattern(host: string): boolean {
  return /^(?:\*\.)?(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host);
}

/** 弹窗里当前勾选的 pattern；隐藏的 host 行不算。 */
function selectedTlsPatterns(root: HTMLElement): string[] {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-tls-compatibility-host]'))
    .filter((row) => row.style.display !== 'none');
  return [...new Set(rows.flatMap((row) =>
    Array.from(row.querySelectorAll<HTMLElement>('.tls-pattern-choice'))
      .filter((choice) => choice.querySelector('.cb')?.classList.contains('on'))
      .map((choice) => choice.querySelector('code')?.textContent?.trim() ?? '')
      .filter(Boolean)))];
}

function syncSelectedTlsPatternCount(root: HTMLElement): void {
  const action = root.querySelector<HTMLButtonElement>('[data-tls-compatibility-add-dialog]');
  const label = action?.querySelector('span');
  if (!action || !label) return;
  const count = selectedTlsPatterns(root).length;
  label.textContent = `Add ${count} patterns`;
  action.disabled = count === 0;
}

function syncTlsRows(root: HTMLElement, patterns: readonly string[]): void {
  const list = root.querySelector<HTMLElement>('.tls-host-list');
  const empty = list?.querySelector<HTMLElement>('.tls-host-empty');
  const template = list?.querySelector<HTMLElement>('[data-tls-host-pattern]');
  if (!list || !empty || !template) return;
  const desired = patterns.map((host) => host.trim().toLowerCase());
  list.querySelectorAll<HTMLElement>('[data-tls-host-pattern]').forEach((row) => {
    if (!desired.includes(row.dataset.tlsHostPattern?.toLowerCase() ?? '')) row.remove();
  });
  desired.forEach((host) => {
    if (list.querySelector(`[data-tls-host-pattern="${CSS.escape(host)}"]`)) return;
    const row = template.cloneNode(true) as HTMLElement;
    row.dataset.tlsHostPattern = host;
    row.dataset.parity = `tls-host-${host}`;
    const code = row.querySelector('code');
    if (code) code.textContent = host;
    // 模板行是内置推荐项，带 "Windows 365 · Recommended" 徽标；用户添加的 pattern 没有来源标注。
    row.querySelector('.sbadge')?.remove();
    list.insertBefore(row, empty);
  });
}

function syncTlsCount(root: HTMLElement): void {
  const count = root.querySelector<HTMLElement>('[data-tls-pattern-count]');
  const total = root.dataset.tlsPassthrough === 'empty' ? 0 : root.querySelectorAll('[data-tls-host-pattern]').length;
  if (count) count.textContent = `${total} ${total === 1 ? 'pattern' : 'patterns'}`;
}

function positionPopovers(root: HTMLElement): void {
  const appRect = root.getBoundingClientRect();
  const footKind = root.classList.contains('thopen') ? 'theme' : root.classList.contains('lgopen') ? 'lang' : '';
  if (footKind) {
    const trigger = root.querySelector<HTMLElement>(footKind === 'theme' ? '[data-thtrigger]' : '[data-lgtrigger]');
    const popover = root.querySelector<HTMLElement>(`.footpop.${footKind}`);
    if (trigger && popover) {
      popover.style.left = `${trigger.offsetLeft + trigger.offsetWidth + 6}px`;
      popover.style.top = `${trigger.offsetTop + trigger.offsetHeight - popover.offsetHeight}px`;
      popover.style.bottom = 'auto';
    }
  }
  const positionInEditor = (triggerSelector: string, popoverSelector: string, open: boolean, matchWidth = false): void => {
    const trigger = root.querySelector<HTMLElement>(triggerSelector);
    const popover = root.querySelector<HTMLElement>(popoverSelector);
    const editor = root.querySelector<HTMLElement>('.reditor');
    if (!trigger || !popover || !editor || !open) return;
    const triggerRect = trigger.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const gap = 4;
    if (matchWidth) {
      const below = triggerRect.bottom + gap + popover.offsetHeight <= appRect.bottom;
      popover.style.top = `${below ? triggerRect.bottom - editorRect.top + gap : triggerRect.top - editorRect.top - popover.offsetHeight - gap}px`;
      popover.style.left = `${triggerRect.left - editorRect.left}px`;
      popover.style.width = `${triggerRect.width}px`;
    } else {
      const right = triggerRect.right + gap + popover.offsetWidth <= appRect.right;
      popover.style.left = `${right ? triggerRect.right - editorRect.left + gap : triggerRect.left - editorRect.left - popover.offsetWidth - gap}px`;
      const top = triggerRect.top - editorRect.top + (triggerRect.height - popover.offsetHeight) / 2;
      popover.style.top = `${Math.min(Math.max(top, appRect.top - editorRect.top), appRect.bottom - editorRect.top - popover.offsetHeight)}px`;
    }
  };
  positionInEditor('#addaction', '.apop', root.dataset.view === 'rules' && root.classList.contains('showpop'));
  positionInEditor('[data-rule-select-trigger]', '.rule-select-pop', root.dataset.ruleSelect === 'open', true);
  const panel = root.querySelector<HTMLElement>('.break-manager');
  const trigger = root.querySelector<HTMLElement>('.breakctl');
  if (panel && trigger && root.dataset.breakpointPanel === 'open' && panel.offsetParent) {
    const parentRect = panel.offsetParent.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    panel.style.left = `${Math.min(triggerRect.left, appRect.right - panel.offsetWidth - 8) - parentRect.left}px`;
    panel.style.top = `${triggerRect.bottom - parentRect.top + 6}px`;
  }
}

/** 一个分组选了 All 以外的项就算已应用；工具栏 badge 与整体 hasFilter 都由此派生。 */
function syncFilterBadge(root: HTMLElement): boolean {
  let applied = false;
  root.querySelectorAll<HTMLElement>('.fgrp').forEach((group) => {
    const rows = Array.from(group.querySelectorAll<HTMLElement>('.fitem'));
    const active = rows.slice(1).some((row) => row.classList.contains('on'));
    group.classList.toggle('applied', active);
    applied ||= active;
  });
  return applied;
}

/** 受控场景字段变化时重置 facet 展开态，普通交互状态更新不得覆盖用户展开结果。 */
function syncFilterGroupExpansion(root: HTMLElement, state: DesignState): void {
  const openGroups = new Set<string>();
  if (state.filterActive) {
    openGroups.add('application');
    openGroups.add('protocol');
  }
  if (state.ruleFilter || state.ruleOptions === 'empty') openGroups.add('rule');
  if (state.filterGroup) openGroups.add(state.filterGroup);
  if (!openGroups.size) openGroups.add('application');
  root.querySelectorAll<HTMLElement>('.fgrp').forEach((group) => {
    group.classList.toggle('on', openGroups.has(group.dataset.grp ?? ''));
  });
}

function syncWebSocketPausedRow(root: HTMLElement, state: DesignState): void {
  const row = root.querySelector<HTMLElement>('.wsrows > .wsrow.sel');
  const direction = row?.querySelector<HTMLElement>('.wsdir');
  const kind = row?.querySelector<HTMLElement>('.wstype');
  const preview = row?.querySelector<HTMLElement>('.wspreview');
  const size = row?.querySelector<HTMLElement>('.wssize');
  const time = row?.querySelector<HTMLElement>('.wstime');
  if (!row || !direction || !kind || !preview || !size || !time) return;
  if (state.breakpointState !== 'websocket') {
    direction.classList.add('in');
    direction.classList.remove('out');
    kind.textContent = 'Text';
    preview.textContent = '{"buildId":8431,"state":"running","branch":"main"}';
    size.textContent = '54 B';
    time.textContent = '+1.4 s';
    return;
  }
  const frame = {
    text: { kind: 'Text', preview: '{"type":"presence","status":"online","userId":"u_1842"}', size: '60 B' },
    binary: { kind: 'Binary', preview: '7b 22 74 79 70 65 22 3a 22 70 72 65 73 65 6e 63 65 …', size: '47 B' },
    ping: { kind: 'PING', preview: '68 62', size: '2 B' },
    pong: { kind: 'PONG', preview: '68 62', size: '2 B' },
    close: { kind: 'CLOSE', preview: '1000 · Normal Closure', size: '16 B' },
  }[state.websocketMessagePayload];
  const sent = state.websocketMessageDirection === 'sent';
  direction.classList.toggle('out', sent);
  direction.classList.toggle('in', !sent);
  kind.textContent = frame.kind;
  preview.textContent = frame.preview;
  size.textContent = frame.size;
  time.textContent = 'paused';
}

function syncFixture(root: HTMLElement, state: DesignState): void {
  setTab(root, '[data-tabs="insp"] > span', '.tp[data-tab]', 'tab', state.tab);
  setTab(root, '[data-tabs="creq"] > span', '.creq > .cpane', 'ctab', state.composerTab);
  setTab(root, '[data-tabs="cresp"] > span', '.cresp > .cpane', 'crtab', state.composerResponseTab);
  root.querySelectorAll<HTMLElement>('.bodytype span').forEach((tab) => tab.classList.toggle('on', tab.dataset.bt === state.bodyType));
  syncWebSocketPausedRow(root, state);
  const search = root.querySelector<HTMLElement>('.omni-q');
  if (search) search.textContent = state.search;
  const hostInput = root.querySelector<HTMLInputElement>('[data-tls-host-input]');
  if (hostInput && hostInput.value !== state.tlsHostInput) hostInput.value = state.tlsHostInput;
  if (state.boot) {
    const phases = BOOT_PHASES[state.boot];
    root.querySelectorAll<HTMLElement>('.boot-dot').forEach((dot) => { dot.dataset.state = phases[dot.dataset.step ?? '']; });
  }
  if (state.tlsPatterns) syncTlsRows(root, state.tlsPatterns);
  syncTlsCount(root);
  if (state.tlsCompatibilityHosts) {
    const hosts = state.tlsCompatibilityHosts.map((host) => host.trim().toLowerCase());
    root.querySelectorAll<HTMLElement>('[data-tls-compatibility-host]').forEach((row) => {
      row.style.display = hosts.includes(row.dataset.tlsCompatibilityHost ?? '') ? '' : 'none';
    });
    const count = hosts.length;
    const countElement = root.querySelector<HTMLElement>('[data-tls-compatibility-count]');
    const label = root.querySelector<HTMLElement>('[data-tls-compatibility-add-label]');
    if (countElement) countElement.textContent = `${count} ${count === 1 ? 'host' : 'hosts'}`;
    if (label) label.textContent = `Add ${count} ${count === 1 ? 'host' : 'hosts'}`;
  }
  const rows = Array.from(root.querySelectorAll<HTMLElement>('.list-scroll .row'));
  const breakpointRow = state.breakpointState === 'queue'
    ? state.breakpointQueueSelection === 'http-queued' ? 'http' : 'breakpoint-request'
    : state.breakpointState === 'websocket' || state.breakpointState.startsWith('websocket-upgrade-')
    ? 'websocket'
    : state.breakpointState === 'response'
      ? 'breakpoint-response'
      : 'breakpoint-request';
  const target = (state.breakpointState && rows.find((row) => row.dataset.captureRow === breakpointRow))
    || (state.scene !== 'http' && rows.find((row) => row.dataset.captureRow === state.scene))
    || rows.find((row) => row.dataset.body === state.bodyKind && !row.classList.contains('breakpoint-row'))
    || rows.find((row) => row.dataset.captureRow === 'http');
  rows.forEach((row) => row.classList.toggle('sel', row === target));
  const dockState: Readonly<Record<string, string>> = {
    view: state.view, theme: state.theme, sidebar: state.sidebar, overlay: state.overlay || 'none', boot: state.boot || 'none',
    upstream: state.upstream || 'none', breakpoints: state.breakpoints, breakpointState: state.breakpointState || 'none',
    breakpointBody: state.breakpointBody, breakpointUi: state.breakpointMessage === 'created' ? 'message' : state.breakpointPanel === 'open' ? 'panel' : 'none',
    ruleTypography: state.ruleTypography,
  };
  document.querySelectorAll<HTMLElement>('.dock .switch').forEach((control) => {
    control.querySelectorAll<HTMLElement>('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.set === dockState[control.dataset.key ?? ''])));
  });
  positionPopovers(root);
}

function anchorTreeMenu(root: HTMLElement, contextMenu: TreeContextMenu, x?: number, y?: number): void {
  const rowSelectors: Readonly<Record<Exclude<TreeContextMenu, ''>, string>> = {
    'composer-item': '.ccol-scroll .citem', 'composer-folder': '.ccol-scroll .cgrp-h',
    'rules-root': '.rtree', 'rules-rule': '.rtree .rrule', 'rules-folder': '.rtree .rgrp-h',
  };
  const menu = root.querySelector<HTMLElement>(`.ctxmenu[data-ctx="${contextMenu}"]`);
  const row = contextMenu ? root.querySelector<HTMLElement>(rowSelectors[contextMenu]) : null;
  if (!menu || !row) return;
  const bounds = root.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  menu.style.left = '0px';
  menu.style.top = '0px';
  const menuRect = menu.getBoundingClientRect();
  const left = x ?? rect.right - 150;
  const top = y ?? rect.bottom + 4;
  menu.style.left = `${Math.max(6, Math.min(left - bounds.left, bounds.width - menuRect.width - 6))}px`;
  menu.style.top = `${Math.max(6, Math.min(top - bounds.top, bounds.height - menuRect.height - 6))}px`;
}

export function useDesignFixtureAdapter(
  rootRef: RefObject<HTMLDivElement | null>,
  state: DesignState,
  updateState: UpdateDesignState,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    syncFixture(root, state);
    if (state.ctxmenu) anchorTreeMenu(root, state.ctxmenu);
  }, [rootRef, state, updateState]);

  // 只在场景字段变化时重置 facet 选中态；跟着整个 state 重置会把用户的点击立刻抹掉。
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('.fitem[data-demo]').forEach((row) => row.classList.toggle('on', row.dataset.demo === (state.filterActive ? 'on' : 'off')));
    const selectedRule = state.ruleFilter ? state.ruleFilter.replace(/^rule-/, '') : 'all';
    root.querySelectorAll<HTMLElement>('.fitem[data-rule]').forEach((row) => row.classList.toggle('on', row.dataset.rule === selectedRule));
    updateState({ hasFilter: syncFilterBadge(root) });
  }, [rootRef, state.filterActive, state.ruleFilter, updateState]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    syncFilterGroupExpansion(root, state);
  }, [
    rootRef,
    state.filterActive,
    state.filterGroup,
    state.ruleFilter,
    state.ruleOptions,
    state.view,
  ]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const dock = document.querySelector<HTMLElement>('.dock');
    let pendingAppContainerToggle: HTMLElement | null = null;
    const updateTlsPatterns = (patterns: readonly string[]): void => {
      const normalized = [...patterns].map((host) => host.trim().toLowerCase()).sort();
      updateState({ tlsPatterns: normalized, tlsPassthrough: normalized.length ? 'ready' : 'empty' });
    };
    const syncFilter = (): void => {
      updateState({ hasFilter: syncFilterBadge(root) });
    };
    const clearFilterGroup = (group: HTMLElement): void => {
      group.querySelectorAll('.fitem').forEach((row, index) => row.classList.toggle('on', index === 0));
    };
    const onClick = (event: MouseEvent): void => {
      const patch = (value: DesignStatePatch): void => updateState(value);
      if (closest(event.target, '.header-sidebar-toggle-v2')) return patch({ sidebar: root.classList.contains('collapsed') ? 'expanded' : 'collapsed' });
      const fileTrigger = closest(event.target, '[data-file-trigger]');
      if (fileTrigger) return patch({ fileMenu: root.dataset.fileMenu === fileTrigger.dataset.fileTrigger ? '' : fileTrigger.dataset.fileTrigger ?? '' });
      if (closest(event.target, '#addaction')) return patch({ pop: !root.classList.contains('showpop') });
      if (closest(event.target, '[data-rule-select-trigger]')) return patch({ ruleSelect: root.dataset.ruleSelect === 'open' ? '' : 'open' });
      const theme = closest(event.target, '[data-themeset]')?.dataset.themeset as DesignState['theme'] | undefined;
      if (theme) return patch({ theme });
      const language = closest(event.target, '[data-langset]')?.dataset.langset;
      if (language) return patch({ lang: language, pop2: '' });
      if (closest(event.target, '[data-thtrigger]')) return patch({ pop2: root.classList.contains('thopen') ? '' : 'theme' });
      if (closest(event.target, '[data-lgtrigger]')) return patch({ pop2: root.classList.contains('lgopen') ? '' : 'lang' });
      const inspectorTab = closest(event.target, '[data-tabs="insp"] > span')?.dataset.tab as DesignState['tab'] | undefined;
      if (inspectorTab) return patch({ tab: inspectorTab, detail: 'open' });
      const settingsNav = closest(event.target, '[data-settings-nav]')?.dataset.settingsNav;
      if (settingsNav) return patch({ settings: settingsNav });
      const publicUpdateAction = closest(event.target, '[data-public-update-action]')?.dataset.publicUpdateAction;
      if (publicUpdateAction === 'check' || publicUpdateAction === 'download') {
        patch({ update: publicUpdateAction === 'check' ? 'checking' : 'downloading' });
        window.setTimeout(() => patch({ update: publicUpdateAction === 'check' ? 'available' : 'downloaded' }), 500);
        return;
      }
      if (closest(event.target, '[data-app-container-refresh]')) {
        patch({ appContainers: 'refreshing' });
        window.setTimeout(() => patch({ appContainers: 'ready' }), 900);
        return;
      }
      const appContainerToggle = closest(event.target, '[data-app-container-toggle]');
      if (appContainerToggle) {
        pendingAppContainerToggle = appContainerToggle;
        const enabling = !appContainerToggle.classList.contains('on');
        const row = appContainerToggle.closest<HTMLElement>('[data-app-container-row]');
        const text = (selector: string, value: string): void => { const element = root.querySelector<HTMLElement>(selector); if (element) element.textContent = value; };
        text('[data-app-container-confirm-title]', enabling ? 'Allow loopback access?' : 'Remove loopback access?');
        text('[data-app-container-confirm-name]', appContainerToggle.dataset.containerName ?? '');
        text('[data-app-container-confirm-action]', enabling ? 'will be allowed to connect to local services on this PC.' : 'will no longer be allowed to connect to local services on this PC.');
        text('[data-app-container-confirm-sid]', row?.querySelector('code')?.textContent ?? '');
        text('[data-app-container-confirm-button]', enabling ? 'Continue to Windows approval' : 'Remove with Windows approval');
        return patch({ overlay: 'app-container-confirm' });
      }
      if (closest(event.target, '[data-app-container-confirm]') && pendingAppContainerToggle) {
        const enabled = !pendingAppContainerToggle.classList.contains('on');
        pendingAppContainerToggle.classList.toggle('on', enabled);
        pendingAppContainerToggle.setAttribute('aria-checked', String(enabled));
        const stateLabel = pendingAppContainerToggle.closest('.sctl')?.querySelector<HTMLElement>('.appcontainer-state');
        if (stateLabel) stateLabel.textContent = enabled ? 'Enabled' : 'Off';
        const count = root.querySelector<HTMLElement>('[data-app-container-enabled-count]');
        if (count) count.textContent = String(root.querySelectorAll('[data-app-container-toggle].on').length);
        pendingAppContainerToggle = null;
        return patch({ overlay: '' });
      }
      if (closest(event.target, '[data-tls-host-add]')) {
        const input = root.querySelector<HTMLInputElement>('[data-tls-host-input]');
        const host = input?.value.trim().toLowerCase() ?? '';
        if (!validTlsHostPattern(host)) return patch({ tlsPassthrough: 'invalid', tlsHostInput: host });
        patch({ tlsHostInput: '' });
        return updateTlsPatterns([...currentTlsPatterns(root), host]);
      }
      const tlsRemove = closest(event.target, '[data-tls-host-remove]')?.closest<HTMLElement>('[data-tls-host-pattern]');
      if (tlsRemove) return updateTlsPatterns(currentTlsPatterns(root).filter((host) => host !== tlsRemove.dataset.tlsHostPattern?.toLowerCase()));
      if (closest(event.target, '[data-tls-compatibility-dismiss]')) return patch({ tlsCompatibility: '', overlay: '' });
      const tlsPatternChoice = closest(event.target, '.tls-pattern-choice');
      if (tlsPatternChoice) {
        tlsPatternChoice.querySelector('.cb')?.classList.toggle('on');
        syncSelectedTlsPatternCount(root);
        return;
      }
      if (closest(event.target, '[data-tls-compatibility-add-dialog]')) {
        const patterns = [...new Set([
          ...currentTlsPatterns(root),
          ...selectedTlsPatterns(root),
        ])];
        updateTlsPatterns(patterns);
        return patch({ view: 'settings', settings: 'tls-passthrough', overlay: '', tlsCompatibility: '' });
      }
      const ruleToggle = closest(event.target, '.rtree .sw');
      if (ruleToggle) { ruleToggle.classList.toggle('on'); return; }
      if (closest(event.target, '[data-rules-import]')) return patch({ overlay: 'rules-import', ctxmenu: '' });
      if (closest(event.target, '[data-collection-import]')) return patch({ overlay: 'composer-import' });
      const rulesChevron = closest(event.target, '.rgrp-chevbtn');
      if (rulesChevron) { rulesChevron.closest('.rgrp')?.classList.toggle('on'); return; }
      const rulesFolder = closest(event.target, '.rgrp-namebtn')?.closest('.rgrp-h');
      if (rulesFolder) { setSelected(root, '.rgrp-h', rulesFolder, 'sel'); setSelected(root, '.rrule', null, 'sel'); return; }
      const rule = closest(event.target, '.rrule');
      if (rule) {
        setSelected(root, '.rgrp-h', null, 'sel'); setSelected(root, '.rrule', rule, 'sel'); setSelected(root, '.rrule', rule, 'open');
        const name = root.querySelector<HTMLElement>('.edname'); if (name) name.textContent = rule.querySelector('.rrule-n')?.textContent ?? '';
        return;
      }
      if (closest(event.target, '.ccol-toggle')) return patch({ collection: root.dataset.collection === 'closed' ? 'open' : 'closed' });
      const composerChevron = closest(event.target, '.cgrp-chevbtn');
      if (composerChevron) { composerChevron.closest('.cgrp')?.classList.toggle('on'); return; }
      const composerFolder = closest(event.target, '.cgrp-namebtn')?.closest('.cgrp-h');
      if (composerFolder) { setSelected(root, '.cgrp-h', composerFolder); setSelected(root, '.citem', null); return; }
      const savedRequest = closest(event.target, '.citem');
      if (savedRequest) { setSelected(root, '.cgrp-h', null); setSelected(root, '.citem', savedRequest); setSelected(root, '.citem', savedRequest, 'open'); return; }
      const composerTab = closest(event.target, '[data-tabs="creq"] > span')?.dataset.ctab as DesignState['composerTab'] | undefined;
      if (composerTab) return patch({ composerTab });
      const responseTab = closest(event.target, '[data-tabs="cresp"] > span')?.dataset.crtab as DesignState['composerResponseTab'] | undefined;
      if (responseTab) return patch({ composerResponseTab: responseTab });
      const documentTab = closest(event.target, '.cdoc');
      if (documentTab) { setSelected(root, '.cdoc', documentTab); return; }
      const bodyType = closest(event.target, '.bodytype span')?.dataset.bt as DesignState['bodyType'] | undefined;
      if (bodyType) return patch({ bodyType });
      if (closest(event.target, '.chist-trigger')) return patch({ composerHistory: root.dataset.composerHistory === 'open' ? '' : 'open' });
      if (closest(event.target, '.cdoc-add')) return patch({ composer: 'empty' });
      if (closest(event.target, '.csend')) return patch({ composer: '' });
      if (closest(event.target, '.cfilters-toggle')) return patch({ filters: root.dataset.filters === 'closed' ? 'open' : 'closed' });
      if (closest(event.target, '.rec')) return patch({ recording: root.dataset.recording === 'paused' ? '' : 'paused' });
      if (closest(event.target, '.breakctl')) return patch({ breakpointPanel: root.dataset.breakpointPanel === 'open' ? '' : 'open', breakpointMessage: '' });
      if (closest(event.target, '.break-manager-close')) return patch({ breakpointPanel: '' });
      if (closest(event.target, '.break-global-toggle')) return patch({ breakpoints: root.dataset.breakpoints === 'off' ? 'on' : 'off' });
      const breakRuleToggle = closest(event.target, '.break-rule-toggle');
      if (breakRuleToggle) {
        const enabled = breakRuleToggle.classList.toggle('on');
        breakRuleToggle.setAttribute('aria-checked', String(enabled));
        breakRuleToggle.closest('.break-manager-rule')?.classList.toggle('off', !enabled);
        const count = root.querySelector<HTMLElement>('.break-enabled-count'); if (count) count.textContent = String(root.querySelectorAll('.break-rule-toggle.on').length);
        return;
      }
      if (closest(event.target, '.break-manager [data-breakpoint-custom]')) return patch({ view: 'rules', breakpointPanel: '' });
      const managerRuleLink = closest(event.target, '.break-rule-open');
      if (managerRuleLink) {
        const ruleId = managerRuleLink.closest<HTMLElement>('.break-manager-rule')?.dataset.managerRule;
        const target = ruleId ? root.querySelector<HTMLElement>(`.rrule[data-rule-id="${CSS.escape(ruleId)}"]`) : null;
        setSelected(root, '.rgrp-h', null, 'sel'); setSelected(root, '.rrule', target, 'sel'); setSelected(root, '.rrule', target, 'open');
        const name = root.querySelector<HTMLElement>('.edname'); if (name && target) name.textContent = target.querySelector('.rrule-n')?.textContent ?? '';
        if (ruleId) root.dataset.managerRule = ruleId;
        return patch({ view: 'rules', breakpointPanel: '' });
      }
      const replaceMode = closest(event.target, '[data-replace-mode]')?.dataset.replaceMode;
      if (replaceMode) return patch({ breakpointBody: replaceMode === 'off' ? 'ready' : replaceMode === 'text' ? 'replace' : 'file' });
      if (closest(event.target, '.break-file-upload-empty')) return patch({ breakpointBody: 'file', breakpointFile: 'valid' });
      if (closest(event.target, '.break-file-remove')) return patch({ breakpointBody: 'file', breakpointFile: 'none' });
      const breakSection = closest(event.target, '.break-section-head');
      if (breakSection && !closest(event.target, '.break-replace-mode, .break-source-tag')) {
        const section = breakSection.closest('.break-section'); const collapsed = section?.classList.toggle('collapsed') ?? false;
        (breakSection.matches('button') ? breakSection : breakSection.querySelector('.break-section-collapse'))?.setAttribute('aria-expanded', String(!collapsed)); return;
      }
      const groupClear = closest(event.target, '.fgrp-clear')?.closest<HTMLElement>('.fgrp');
      if (groupClear) { clearFilterGroup(groupClear); syncFilter(); return; }
      const groupHead = closest(event.target, '.fgrp-toggle');
      if (groupHead) { groupHead.closest('.fgrp')?.classList.toggle('on'); return; }
      const facet = closest(event.target, '.fitem');
      if (facet) {
        const rows = Array.from(facet.closest('.fgrp-b')?.querySelectorAll<HTMLElement>('.fitem') ?? []); const all = rows[0];
        if (facet === all) rows.forEach((row) => row.classList.toggle('on', row === all));
        else { facet.classList.toggle('on'); all?.classList.toggle('on', !rows.slice(1).some((row) => row.classList.contains('on'))); }
        syncFilter(); return;
      }
      if (closest(event.target, '.omni-clear')) return patch({ search: '' });
      if (closest(event.target, '.cfilters-clear')) { root.querySelectorAll<HTMLElement>('.fgrp').forEach(clearFilterGroup); syncFilter(); return; }
      if (closest(event.target, '.iclose')) return patch({ detail: 'closed' });
      const bodyMode = closest(event.target, '.bodybar .seg span[data-mode]')?.dataset.mode as DesignState['bodyMode'] | undefined;
      if (bodyMode) return patch({ bodyMode });
      const captureRow = closest(event.target, '.list-scroll .row');
      if (captureRow) {
        if (root.dataset.breakpointState === 'queue' && captureRow.dataset.queueKey === 'http') {
          return patch({
            breakpointQueueSelection: captureRow.dataset.breakpointState === 'queued'
              ? 'http-queued'
              : 'http-head',
            detail: 'open',
          });
        }
        const phase = captureRow.dataset.breakpointPhase as DesignState['breakpointState'] | undefined;
        if (phase) return patch({ breakpointState: phase, detail: 'open' });
        const scene = captureRow.dataset.captureRow === 'http' ? 'http' : captureRow.dataset.captureRow ?? 'http';
        const bodyPreview = (captureRow.dataset.body || 'json') as DesignState['bodyPreview'];
        const tab = scene === 'tunnel' ? 'tunnel' : scene === 'websocket' ? 'messages' : scene === 'grpc' ? 'grpc' : captureRow.dataset.body ? 'response' : 'headers';
        return patch({ scene, bodyPreview, tab, detail: 'open' });
      }
      if (closest(event.target, '.break-foot .btn')) return patch({ breakpointState: '' });
      if (closest(event.target, '[data-show-rule-requests]')) return patch({ view: 'capture', ruleFilter: 'rule-stub' });
      if (closest(event.target, '[data-rule-link]')) return patch({ view: 'rules' });
      if (closest(event.target, '[data-open-https]')) return patch({ overlay: 'https-setup' });
      if (closest(event.target, '[data-body-full]')) return patch({ overlay: 'body-full' });
      if (closest(event.target, '[data-close-overlay]')) return patch({ overlay: '' });
      const matcherToggle = closest(event.target, '.mtg');
      if (matcherToggle) {
        if (matcherToggle.dataset.mtg === 'case') matcherToggle.classList.toggle('on');
        else {
          const turnOn = !matcherToggle.classList.contains('on');
          matcherToggle.closest('.mtoggles')?.querySelectorAll('[data-mtg="exact"],[data-mtg="regex"]').forEach((button) => button.classList.remove('on'));
          matcherToggle.classList.toggle('on', turnOn);
        }
      }
      const more = closest(event.target, '.cgrp-more, .rgrp-more');
      if (more) {
        event.stopPropagation();
        const composer = more.classList.contains('cgrp-more');
        const row = more.closest<HTMLElement>(composer ? '.cgrp-h' : '.rgrp-h');
        root.querySelectorAll('.menuopen').forEach((element) => element.classList.remove('menuopen'));
        row?.classList.add('menuopen');
        const rect = more.getBoundingClientRect();
        openTreeMenu(composer ? 'composer-folder' : 'rules-folder', rect.left, rect.bottom + 4);
      }
    };
    let treeMenuJustOpened = false;
    const openTreeMenu = (contextMenu: TreeContextMenu, x: number, y: number): void => {
      treeMenuJustOpened = true; window.setTimeout(() => { treeMenuJustOpened = false; }, 0);
      updateState({ ctxmenu: contextMenu }); window.requestAnimationFrame(() => anchorTreeMenu(root, contextMenu, x, y));
    };
    const onContextMenu = (event: MouseEvent): void => {
      const targets: readonly [string, TreeContextMenu][] = [['.citem', 'composer-item'], ['.cgrp-h', 'composer-folder'], ['.rrule', 'rules-rule'], ['.rgrp-h', 'rules-folder']];
      for (const [selector, contextMenu] of targets) if (closest(event.target, selector)) { event.preventDefault(); openTreeMenu(contextMenu, event.clientX, event.clientY); return; }
      if (event.target === root.querySelector('.rtree')) { event.preventDefault(); openTreeMenu('rules-root', event.clientX, event.clientY); return; }
      updateState({ ctxmenu: '', requestMenu: '' });
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') updateState({ ctxmenu: '', requestMenu: '' });
    };
    const onBlur = (): void => updateState({ ctxmenu: '', requestMenu: '' });
    const closeTreeMenu = (): void => { if (root.dataset.ctxmenu && !treeMenuJustOpened) updateState({ ctxmenu: '' }); };
    const onInput = (event: Event): void => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.matches('[data-app-container-search]')) {
        const query = input.value.trim().toLowerCase(); let visible = 0;
        root.querySelectorAll<HTMLElement>('[data-app-container-row]').forEach((row) => { const show = !query || (row.dataset.search ?? '').includes(query); row.style.display = show ? '' : 'none'; if (show) visible += 1; });
        root.querySelector('.appcontainer-list')?.classList.toggle('search-empty', visible === 0);
      }
    };
    const onDockClick = (event: MouseEvent): void => {
      const toggle = closest(event.target, '.dock-toggle'); if (toggle && dock) { dock.dataset.open = dock.dataset.open === 'true' ? 'false' : 'true'; return; }
      const button = closest(event.target, '.dock .switch button'); const key = button?.closest<HTMLElement>('.switch')?.dataset.key;
      if (button && key) updateState({ [key]: button.dataset.set === 'none' ? '' : button.dataset.set } as DesignStatePatch);
    };
    const resizeObserver = new ResizeObserver(() => {
      const scroll = root.querySelector<HTMLElement>('.list-scroll'); const head = root.querySelector<HTMLElement>('.lhead');
      if (scroll && head) head.style.paddingRight = `${14 + scroll.offsetWidth - scroll.clientWidth}px`;
      positionPopovers(root);
    });
    const scroll = root.querySelector<HTMLElement>('.list-scroll'); if (scroll) resizeObserver.observe(scroll);
    const cleanups = [
      installTreeDrag({ tree: root.querySelector('.rtree'), rowSelector: '.rrule, .rgrp-h', folderRowClass: 'rgrp-h', groupClass: 'rgrp', groupBodyClass: 'rgrp-b' }),
      installTreeDrag({ tree: root.querySelector('.ccol-scroll'), rowSelector: '.citem, .cgrp-h', folderRowClass: 'cgrp-h', groupClass: 'cgrp', groupBodyClass: 'cgrp-b' }),
      installTreeSearch({ input: root.querySelector('.rlbar .tree-search input'), tree: root.querySelector('.rtree'), groupClass: 'rgrp', rowSelector: '.rrule', nameSelector: '.rrule-n, .rgrp-n' }),
      installTreeSearch({ input: root.querySelector('.ccol-bar .tree-search input'), tree: root.querySelector('.ccol-scroll'), groupClass: 'cgrp', rowSelector: '.citem', nameSelector: '.citem-n, .cgrp-n' }),
    ];
    root.addEventListener('click', onClick);
    root.addEventListener('click', closeTreeMenu);
    root.addEventListener('contextmenu', onContextMenu);
    root.addEventListener('input', onInput);
    dock?.addEventListener('click', onDockClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    const onResize = (): void => positionPopovers(root);
    window.addEventListener('resize', onResize);
    return () => {
      root.removeEventListener('click', onClick); root.removeEventListener('click', closeTreeMenu);
      root.removeEventListener('contextmenu', onContextMenu);
      root.removeEventListener('input', onInput);
      dock?.removeEventListener('click', onDockClick); resizeObserver.disconnect(); cleanups.forEach((cleanup) => cleanup());
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
    };
  }, [rootRef, updateState]);
}