import path from 'node:path';

import {
  app,
  MessageChannelMain,
  utilityProcess,
  type MessagePortMain,
  type UtilityProcess,
} from 'electron';

import type { MainToCoreMessage } from '@interceptor/core-protocol';

import { type CoreRpcClient, type CoreRpcPort } from './core-rpc-client';
import type { CoreProcessHandle } from './core-supervisor';

export function createElectronCoreProcess(
  rpcClient: CoreRpcClient,
): CoreProcessHandle {
  const child = utilityProcess.fork(resolveCoreEntry(), [], {
    serviceName: 'Interceptor Proxy Core',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipeCoreOutput(child);
  try {
    connectRpcPort(child, rpcClient);
  } catch (error) {
    child.kill();
    throw error;
  }

  return {
    get pid() {
      return child.pid;
    },
    onSpawn: (listener) => child.on('spawn', listener),
    onMessage: (listener) => child.on('message', listener),
    onExit: (listener) => child.on('exit', listener),
    onError(listener) {
      child.on('error', (type, location) => {
        listener(`${type} at ${location}`);
      });
    },
    postMessage: (message) => child.postMessage(message),
    kill: () => child.kill(),
  };
}

function connectRpcPort(
  child: UtilityProcess,
  rpcClient: CoreRpcClient,
): void {
  // parentPort 只负责把业务 MessagePort 交给 Core；后续 command 不再经过
  // Supervisor，避免生命周期消息和业务 RPC 混在一起。
  const { port1, port2 } = new MessageChannelMain();
  try {
    rpcClient.attach(createCoreRpcPort(port1));
    child.postMessage({ type: 'rpc-port' }, [port2]);
  } catch (error) {
    rpcClient.close();
    try {
      port2.close();
    } catch {
      // port2 可能已经完成所有权转移。
    }
    throw error;
  }
  child.once('exit', () => rpcClient.close());
}

function createCoreRpcPort(port: MessagePortMain): CoreRpcPort {
  return {
    onMessage(listener) {
      const handler = (event: Electron.MessageEvent) => listener(event.data);
      port.on('message', handler);
      return () => port.off('message', handler);
    },
    onClose(listener) {
      port.on('close', listener);
      return () => port.off('close', listener);
    },
    postMessage(message: MainToCoreMessage) {
      port.postMessage(message);
    },
    start: () => port.start(),
    close: () => port.close(),
  };
}

function resolveCoreEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'proxy-core', 'core-entry.cjs');
  }
  return path.resolve(
    app.getAppPath(),
    '../proxy-core/dist/proxy-core/core-entry.cjs',
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