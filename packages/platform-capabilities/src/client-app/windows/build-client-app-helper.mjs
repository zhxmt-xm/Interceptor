import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

if (process.platform !== 'win32') {
  console.log('[build-client-app-helper] skipped on non-Windows platform');
  process.exit(0);
}

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const source = path.join(import.meta.dirname, 'windows-helper.cs');
const outputDirectory = path.join(packageRoot, 'dist/client-app');
const output = path.join(outputDirectory, 'client-app-helper.exe');
const frameworkRoot = path.join(
  process.env.WINDIR ?? 'C:\\Windows',
  'Microsoft.NET',
);
const candidates = [
  path.join(frameworkRoot, 'Framework64/v4.0.30319/csc.exe'),
  path.join(frameworkRoot, 'Framework/v4.0.30319/csc.exe'),
];
const compiler = candidates.find(existsSync);

if (!compiler) {
  throw new Error('Windows .NET Framework C# compiler was not found.');
}

await mkdir(outputDirectory, { recursive: true });
await new Promise((resolve, reject) => {
  const child = spawn(
    compiler,
    [
      '/nologo',
      '/optimize+',
      '/target:exe',
      '/platform:anycpu',
      '/r:System.Drawing.dll',
      `/out:${output}`,
      source,
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`csc exited with code ${code ?? 'unknown'}`));
    }
  });
});

console.log(`[build-client-app-helper] built ${path.relative(packageRoot, output)}`);
