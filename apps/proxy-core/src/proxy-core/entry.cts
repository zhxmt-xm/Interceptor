import process from 'node:process';

import {
  CoreApplication,
  type CoreParentPort,
} from './core-application';

// UtilityProcess 可执行组合根：只读取 Electron 注入的 parentPort 并启动应用根对象。
const parentPort = (
  process as NodeJS.Process & { parentPort?: CoreParentPort }
).parentPort;

if (!parentPort) {
  process.stderr.write('Proxy Core requires Electron UtilityProcess.parentPort.\n');
  process.exitCode = 1;
} else {
  new CoreApplication(parentPort).start();
}