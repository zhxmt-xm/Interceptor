import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTOMATION_IDS } from '../../../../../shared/automation-ids';
import type { UpdateStatus } from '../../../../../shared/desktop-api';
import type { ButtonProps } from '../../../../components/Button/Button';
import type { IconButtonProps } from '../../../../components/IconButton/IconButton';
import { Button, IconButton, StatusBadge } from '../../../../components';
import { UpdateNotification } from '../../UpdateNotification/UpdateNotification';
import { UpdatesPanel } from '../../SettingsContent/UpdatesPanel';
import { SettingsGroup } from '../../SettingsContent/SettingsGroup';
import { UpdateFormat } from '../../utils';

const state = vi.hoisted(() => ({
  status: null as UpdateStatus | null,
  busy: false,
  dismissed: false,
  dismiss: vi.fn(),
  check: vi.fn(),
  download: vi.fn(),
  cancel: vi.fn(),
  copyLink: vi.fn(),
  openDownloaded: vi.fn(),
}));

vi.mock('../../data/updateStore', () => ({
  useUpdateStore: (select: (value: typeof state) => unknown) => select(state),
  UpdateActions: {
    check: state.check,
    download: state.download,
    cancel: state.cancel,
    copyLink: state.copyLink,
    openDownloaded: state.openDownloaded,
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }));
vi.mock('../../../../components', () => ({
  Button: () => null,
  IconButton: () => null,
  StatusBadge: () => null,
}));

function findControl<Props>(tree: ReactNode, component: unknown): ReactElement<Props> {
  const pending = Children.toArray(tree);
  while (pending.length > 0) {
    const candidate = pending.shift();
    if (!isValidElement<{ children?: ReactNode }>(candidate)) continue;
    if (candidate.type === component) return candidate as ReactElement<Props>;
    pending.push(...Children.toArray(candidate.props.children));
  }
  throw new Error('Missing notification control.');
}

function findByAutomationId(tree: ReactNode, automationId: string): ReactElement<Record<string, unknown>> {
  if (!automationId) throw new Error('Missing automation id constant.');
  const pending = Children.toArray(tree);
  while (pending.length > 0) {
    const candidate = pending.shift();
    if (!isValidElement<{ children?: ReactNode }>(candidate)) continue;
    if ((candidate.props as Record<string, unknown>)['data-automation-id'] === automationId) {
      return candidate as ReactElement<Record<string, unknown>>;
    }
    pending.push(...Children.toArray(candidate.props.children));
  }
  throw new Error(`Missing automation element ${automationId}.`);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.busy = false;
  state.dismissed = false;
  state.status = {
    supported: true,
    state: 'available',
    currentVersion: '0.1.0',
    latestVersion: '0.1.1',
    progress: null,
    downloadedBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    etaSeconds: null,
    releaseNotes: null,
    message: null,
    lastCheckedAt: null,
  };
});

describe('Update notification controls', () => {
  it.each(['available', 'downloaded'] as const)('uses a compact action in the %s notification', (updateState) => {
    state.status!.state = updateState;
    const action = findControl<ButtonProps>(UpdateNotification(), Button);

    expect(action.props.size).toBe('compact');
    expect(action.props.variant).toBe('primary');
    expect(action.props.children).toBe(updateState === 'available' ? 'settings.download' : 'settings.open');
    action.props.onClick?.();
    expect(state.download).toHaveBeenCalledTimes(updateState === 'available' ? 1 : 0);
    expect(state.openDownloaded).toHaveBeenCalledTimes(updateState === 'downloaded' ? 1 : 0);
  });

  it('disables the action while working and keeps dismissal available', () => {
    state.busy = true;
    const tree = UpdateNotification();
    expect(findControl<ButtonProps>(tree, Button).props.disabled).toBe(true);
    findControl<IconButtonProps>(tree, IconButton).props.onClick?.();
    expect(state.dismiss).toHaveBeenCalledOnce();
  });

  it.each(['checking', 'downloading', 'up-to-date', 'failed', 'unsupported'] as const)('hides the %s notification', (updateState) => {
    state.status!.state = updateState;
    expect(UpdateNotification()).toBeNull();
  });

  it('hides a dismissed notification', () => {
    state.dismissed = true;
    expect(UpdateNotification()).toBeNull();
  });

  it('hides the notification until a status is available', () => {
    state.status = null;
    expect(UpdateNotification()).toBeNull();
  });
});

describe('Update automation surface', () => {
  it('exposes stable automation ids for the notification and its real actions', () => {
    const tree = UpdateNotification();

    expect(findByAutomationId(tree, AUTOMATION_IDS.settings.updateNotification.root)
      .props['data-state']).toBe('available');
    expect(findControl<ButtonProps>(tree, Button).props.automationId)
      .toBe(AUTOMATION_IDS.settings.updateNotification.action);
    expect(findControl<IconButtonProps>(tree, IconButton).props.automationId)
      .toBe(AUTOMATION_IDS.settings.updateNotification.dismiss);
  });

  it('exposes byte and progress values while the installer downloads', () => {
    Object.assign(state.status!, {
      state: 'downloading',
      progress: 0.42,
      downloadedBytes: 70_000_000,
      totalBytes: 167_000_000,
      bytesPerSecond: 2_500_000,
      etaSeconds: 39,
    });

    const progress = findByAutomationId(UpdatesPanel(), AUTOMATION_IDS.settings.updates.progress);

    expect(progress.props['data-progress']).toBe(0.42);
    expect(progress.props['data-downloaded-bytes']).toBe(70_000_000);
    expect(progress.props['data-total-bytes']).toBe(167_000_000);
    expect(progress.props['data-bytes-per-second']).toBe(2_500_000);
    expect(progress.props['data-eta-seconds']).toBe(39);
  });
});

describe('Updates download controls', () => {
  it('offers cancel and copy actions while downloading', () => {
    Object.assign(state.status!, {
      state: 'downloading',
      progress: 0.5,
      downloadedBytes: 83_000_000,
      totalBytes: 167_000_000,
      bytesPerSecond: 2_500_000,
      etaSeconds: 34,
    });
    const tree = UpdatesPanel();

    const cancel = findControl<ButtonProps>(tree, Button);
    expect(cancel.props.automationId).toBe(AUTOMATION_IDS.settings.updates.cancel);
    expect(cancel.props.children).toBe('settings.cancelDownload');
    cancel.props.onClick?.();
    expect(state.cancel).toHaveBeenCalledOnce();

    const copy = findControl<IconButtonProps>(tree, IconButton);
    expect(copy.props.automationId).toBe(AUTOMATION_IDS.settings.updates.copyLink);
    expect(copy.props.label).toBe('settings.copyDownloadLink');
    copy.props.onClick?.();
    expect(state.copyLink).toHaveBeenCalledOnce();
  });

  it('offers the copy action next to an available installer', () => {
    const copy = findControl<IconButtonProps>(UpdatesPanel(), IconButton);

    expect(copy.props.automationId).toBe(AUTOMATION_IDS.settings.updates.copyLink);
    copy.props.onClick?.();
    expect(state.copyLink).toHaveBeenCalledOnce();
  });

  it('formats the transfer rate and remaining time', () => {
    Object.assign(state.status!, { bytesPerSecond: 1_310_720, etaSeconds: 65 });

    expect(UpdateFormat.speed(state.status!, 'en')).toBe('1.3 MB/s');
    expect(UpdateFormat.eta(state.status!)).toBe('1m 5s');
    Object.assign(state.status!, { bytesPerSecond: null, etaSeconds: null });
    expect(UpdateFormat.speed(state.status!, 'en')).toBeNull();
    expect(UpdateFormat.eta(state.status!)).toBeNull();
  });
});

describe('Updates anonymous controls', () => {
  it('labels the installed alpha version without claiming it is stable', () => {
    state.status!.currentVersion = '0.1.1-alpha.1';
    const group = findControl<{ title: string; children: ReactNode }>(UpdatesPanel(), SettingsGroup);
    const badge = findControl<{ children: ReactNode }>(group.props.children, StatusBadge);
    expect(badge.props.children).toBe('settings.installed');
  });

  it.each([
    ['idle', RefreshCw, 'settings.checkNow', 'check'],
    ['failed', RefreshCw, 'settings.checkNow', 'check'],
    ['up-to-date', RefreshCw, 'settings.checkNow', 'check'],
    ['available', Download, 'settings.downloadUpdate', 'download'],
    ['downloaded', ExternalLink, 'settings.openInstaller', 'openDownloaded'],
  ] as const)('exposes the %s action without signing in', (updateState, icon, label, actionName) => {
    state.status!.state = updateState;
    const action = findControl<ButtonProps>(UpdatesPanel(), Button);

    expect(action.props.icon).toBe(icon);
    expect(action.props.children).toBe(label);
    expect(action.props.disabled).toBe(false);
    action.props.onClick?.();
    expect(state[actionName]).toHaveBeenCalledOnce();
  });

  it('starts with Version instead of a GitHub access group', () => {
    const group = findControl<{ title: string }>(UpdatesPanel(), SettingsGroup);
    expect(group.props.title).toBe('settings.version');
  });

  it.each(['checking', 'unsupported'] as const)('does not offer actions while %s', (updateState) => {
    state.status!.state = updateState;
    state.status!.supported = updateState !== 'unsupported';
    expect(() => findControl<ButtonProps>(UpdatesPanel(), Button)).toThrow('Missing notification control.');
  });

  it('disables the anonymous action while its command is busy', () => {
    state.busy = true;
    const action = findControl<ButtonProps>(UpdatesPanel(), Button);
    expect(action.props.disabled).toBe(true);
  });
});
