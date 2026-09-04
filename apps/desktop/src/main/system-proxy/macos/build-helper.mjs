import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

if (process.platform !== 'darwin') {
  console.log('[build-macos-helper] skipped on non-macOS platform');
  process.exit(0);
}

const desktopRoot = path.resolve(import.meta.dirname, '../../../..');
const source = path.join(import.meta.dirname, 'helper.swift');
const outputDirectory = path.join(desktopRoot, 'dist/system-proxy');
const output = path.join(outputDirectory, 'macos-proxy-helper');

await mkdir(outputDirectory, { recursive: true });
await new Promise((resolve, reject) => {
  const child = spawn(
    'xcrun',
    [
      'swiftc',
      '-O',
      '-framework',
      'Security',
      '-framework',
      'SystemConfiguration',
      '-o',
      output,
      source,
    ],
    { stdio: 'inherit' },
  );
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`swiftc exited with code ${code ?? 'unknown'}`));
    }
  });
});

console.log(`[build-macos-helper] built ${path.relative(desktopRoot, output)}`);