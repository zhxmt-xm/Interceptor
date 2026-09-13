import { GithubOutlined } from '@ant-design/icons';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateStatus } from '../../../../../shared/desktop-api';
import type { ButtonProps } from '../../../../components/Button/Button';
import type { IconButtonProps } from '../../../../components/IconButton/IconButton';
import { Button, IconButton } from '../../../../components';
import { UpdateNotification } from '../../UpdateNotification/UpdateNotification';
import { UpdatesPanel } from '../../SettingsContent/UpdatesPanel';

const state = vi.hoisted(() => ({
  status: null as UpdateStatus | null,
  busy: false,
  dismissed: false,
  dismiss: vi.fn(),
  download: vi.fn(),
  openDownloaded: vi.fn(),
}));

const githubState = vi.hoisted(() => ({
  status: { state: 'signed-out' },
  busy: false,
  error: null,
  signIn: vi.fn(),
}));

vi.mock('../../data/githubAuthStore', () => ({
  useGitHubAuthStore: (select: (value: typeof githubState) => unknown) => select(githubState),
  GitHubAuthActions: { signIn: githubState.signIn },
}));

vi.mock('../../data/updateStore', () => ({
  useUpdateStore: (select: (value: typeof state) => unknown) => select(state),
  UpdateActions: { download: state.download, openDownloaded: state.openDownloaded },
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

beforeEach(() => {
  vi.clearAllMocks();
  state.busy = false;
  state.dismissed = false;
  githubState.busy = false;
  state.status = {
    supported: true,
    state: 'available',
    currentVersion: '0.1.0',
    latestVersion: '0.1.1',
    progress: null,
    downloadedBytes: null,
    totalBytes: null,
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

describe('Updates GitHub sign-in control', () => {
  it.each([false, true])('uses the shared icon slot while busy=%s', (busy) => {
    githubState.busy = busy;
    const action = findControl<ButtonProps>(UpdatesPanel(), Button);

    expect(action.props.icon).toBe(GithubOutlined);
    expect(action.props.children).toBe('settings.signInWithGitHub');
    expect(action.props.loading).toBe(busy);
    action.props.onClick?.();
    expect(githubState.signIn).toHaveBeenCalledOnce();
  });
});