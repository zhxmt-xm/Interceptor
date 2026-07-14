import process from 'node:process';
import path from 'node:path';

import { CoreApplication, type CoreParentPort } from './core-application';
import { DiagnosticsWorkerHost } from './diagnostics/diagnostics-worker-host';
import { CaptureEventQueue } from './proxy/capture-event-queue';
import { ProxyService } from './proxy/proxy-service';
import { StorageService } from './storage/storage-service';

// UtilityProcess 可执行组合根：只读取 Electron 注入的 parentPort 并启动应用根对象。
const parentPort = (
  process as NodeJS.Process & { parentPort?: CoreParentPort }
).parentPort;

if (!parentPort) {
  process.stderr.write('Proxy Core requires Electron UtilityProcess.parentPort.\n');
  process.exitCode = 1;
} else {
  const dataDir = readDataDir(process.argv);
  const storage = dataDir ? new StorageService({ dataDir }) : undefined;
  const diagnosticsLog = dataDir
    ? new DiagnosticsWorkerHost({
        databaseLocation: path.join(dataDir, 'diagnostics.sqlite'),
      })
    : undefined;
  const captureEvents = storage ? new CaptureEventQueue() : undefined;
  const proxy =
    storage && captureEvents
      ? new ProxyService({
          sink: storage,
          appVersion: readAppVersion(),
          onCaptureEvent: (kind, summary) =>
            captureEvents.enqueue(kind, summary),
        })
      : undefined;
  new CoreApplication(parentPort, {
    storage,
    diagnosticsLog,
    proxy,
    captureEvents,
  }).start();
}

/**
 * 解析 Main 通过 fork 参数注入的存储根目录（`--data-dir=<path>`）。
 * 缺省时返回 undefined，CoreApplication 将以无存储模式运行。
 */
function readDataDir(argv: readonly string[]): string | undefined {
  return readArg(argv, '--data-dir=');
}

/**
 * 解析 Main 注入的应用版本（`--app-version=<v>`），用于捕获会话元数据。
 * 缺省回落到 0.0.0。
 */
function readAppVersion(): string {
  return readArg(process.argv, '--app-version=') ?? '0.0.0';
}

function readArg(argv: readonly string[], prefix: string): string | undefined {
  const arg = argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
