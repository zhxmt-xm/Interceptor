import process from 'node:process';

import {
  CoreProcess,
  type CoreParentPort,
} from './core-process';

const parentPort = (
  process as NodeJS.Process & { parentPort?: CoreParentPort }
).parentPort;

if (!parentPort) {
  process.stderr.write('Proxy Core requires Electron UtilityProcess.parentPort.\n');
  process.exitCode = 1;
} else {
  new CoreProcess(parentPort).start();
}