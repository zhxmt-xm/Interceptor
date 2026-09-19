import { url as inspectorUrl } from 'node:inspector';

import { app, utilityProcess } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CoreRuntime } from '../../core-runtime';

vi.mock('node:inspector', () => ({ url: vi.fn() }));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/workspace/apps/desktop',
    getPath: () => '/profile',
    getVersion: () => '0.1.0',
  },
  utilityProcess: {
    fork: vi.fn(() => {
      throw new Error('Fork arguments recorded without launching Electron');
    }),
  },
}));

vi.mock('../../../platform-capabilities/entry', () => ({
  resolveClientAppHelperPath: () => null,
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Core inspector follows Main debugging', () => {
  it.each([
    {
      name: 'does not enable inspection during ordinary startup',
      isPackaged: false,
      mainInspectorUrl: undefined,
      mainArguments: [],
      coreArguments: [],
    },
    {
      name: 'opens an independent loopback port when Main is inspected',
      isPackaged: false,
      mainInspectorUrl: 'ws://127.0.0.1:9229/main',
      mainArguments: ['--inspect'],
      coreArguments: ['--inspect=127.0.0.1:0'],
    },
    {
      name: 'does not reuse a custom Main port or non-loopback host',
      isPackaged: false,
      mainInspectorUrl: 'ws://0.0.0.0:9230/main',
      mainArguments: ['--inspect=0.0.0.0:9230'],
      coreArguments: ['--inspect=127.0.0.1:0'],
    },
    {
      name: 'enables Core inspection without inheriting the Main startup break',
      isPackaged: false,
      mainInspectorUrl: 'ws://127.0.0.1:9229/main',
      mainArguments: ['--inspect-brk'],
      coreArguments: ['--inspect=127.0.0.1:0'],
    },
    {
      name: 'does not enable inspection from an inactive Main flag',
      isPackaged: false,
      mainInspectorUrl: undefined,
      mainArguments: ['--inspect'],
      coreArguments: [],
    },
    {
      name: 'keeps packaged Core inspection disabled even if Main is inspected',
      isPackaged: true,
      mainInspectorUrl: 'ws://127.0.0.1:9229/main',
      mainArguments: ['--inspect'],
      coreArguments: [],
    },
  ])('$name', async ({ isPackaged, mainInspectorUrl, mainArguments, coreArguments }) => {
    Object.assign(app, { isPackaged });
    vi.mocked(inspectorUrl).mockReturnValue(mainInspectorUrl);
    vi.stubGlobal('process', {
      ...process,
      resourcesPath: '/resources',
      execArgv: mainArguments,
    });
    const coreRuntime = new CoreRuntime();

    try {
      coreRuntime.start();

      expect(utilityProcess.fork).toHaveBeenCalledOnce();
      const options = vi.mocked(utilityProcess.fork).mock.calls[0]?.[2];
      expect(options?.execArgv ?? []).toEqual(coreArguments);
    } finally {
      await coreRuntime.stop();
    }
  });
});