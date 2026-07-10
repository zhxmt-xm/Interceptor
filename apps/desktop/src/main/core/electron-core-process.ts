import path from 'node:path';

import { app, utilityProcess, type UtilityProcess } from 'electron';

import type { CoreProcessHandle } from './core-supervisor';

export function createElectronCoreProcess(): CoreProcessHandle {
  const child = utilityProcess.fork(resolveCoreEntry(), [], {
    serviceName: 'Interceptor Proxy Core',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipeCoreOutput(child);

  return {
    get pid() {
      return child.pid;
    },
    onSpawn(listener) {
      child.on('spawn', listener);
    },
    onMessage(listener) {
      child.on('message', listener);
    },
    onExit(listener) {
      child.on('exit', listener);
    },
    onError(listener) {
      child.on('error', (type, location) => {
        listener(`${type} at ${location}`);
      });
    },
    postMessage(message) {
      child.postMessage(message);
    },
    kill() {
      return child.kill();
    },
  };
}

function resolveCoreEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'proxy-core', 'index.cjs');
  }

  return path.resolve(
    app.getAppPath(),
    '../proxy-core-node/dist/proxy-core/index.cjs',
  );
}

function pipeCoreOutput(child: UtilityProcess): void {
  child.stdout?.on('data', (chunk: Buffer | string) => {
    process.stdout.write(`[proxy-core] ${chunk.toString()}`);
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    process.stderr.write(`[proxy-core] ${chunk.toString()}`);
  });
}