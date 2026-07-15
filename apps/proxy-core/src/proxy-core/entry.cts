import process from 'node:process';

import { initializeRuntime } from './constants';
import { CoreApplication, type CoreParentPort } from './core-application';

// UtilityProcess 可执行组合根入口：读取 Electron 注入的 parentPort，初始化运行期配置
// （确保 dataDir 与 worker bundle 路径正确），再交由 CoreApplication.bootstrap 组装并启动。
const parentPort = (
  process as NodeJS.Process & { parentPort?: CoreParentPort }
).parentPort;

if (!parentPort) {
  process.stderr.write(
    'Proxy Core requires Electron UtilityProcess.parentPort.\n',
  );
  process.exitCode = 1;
} else {
  initializeRuntime(process.argv);
  CoreApplication.bootstrap(parentPort);
}
