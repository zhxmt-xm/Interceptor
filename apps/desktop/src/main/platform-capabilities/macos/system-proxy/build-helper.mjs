import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

if (process.platform !== 'darwin') {
  console.log('[build-macos-helper] skipped on non-macOS platform');
  process.exit(0);
}

const desktopRoot = path.resolve(import.meta.dirname, '../../../../..');
const source = path.join(import.meta.dirname, 'helper.swift');
const outputDirectory = path.join(desktopRoot, 'dist/system-proxy');
const output = path.join(outputDirectory, 'macos-proxy-helper');
const cachePath = path.join(desktopRoot, 'dist/.macos-proxy-helper-build.json');
const entitlementsPath = path.join(desktopRoot, 'assets/macos-native-helper-entitlements.plist');
const sources = [
  source,
  path.join(import.meta.dirname, 'native-service-contract.swift'),
  path.join(import.meta.dirname, 'native-service.swift'),
  path.join(import.meta.dirname, '../installation/native-installation.swift'),
  path.join(import.meta.dirname, '../trust-store/native-certificates.swift'),
];
const buildArguments = [
  'swiftc', '-O', '-parse-as-library', '-framework', 'Security',
  '-framework', 'AppKit', '-framework', 'SystemConfiguration', '-o', output, ...sources,
];
const signingArguments = [
  '--force', '--sign', '-', '--options', 'runtime', '--timestamp=none',
  '--entitlements', entitlementsPath,
  '--identifier', 'com.zhxmt.interceptor.platform-capabilities', output,
];
const execute = promisify(execFile);
const compilerVersion = (await execute('xcrun', ['swiftc', '--version'], { encoding: 'utf8' })).stdout;
const sdkPath = (await execute('xcrun', ['--show-sdk-path'], { encoding: 'utf8' })).stdout.trim();
const inputDigest = createHash('sha256').update(JSON.stringify({
  compilerVersion, sdkPath, architecture: process.arch, buildArguments, signingArguments,
  deploymentTarget: process.env.MACOSX_DEPLOYMENT_TARGET,
}));
for (const sourcePath of [...sources, entitlementsPath]) inputDigest.update(await readFile(sourcePath));
const inputSha256 = inputDigest.digest('hex');

try {
  const cache = JSON.parse(await readFile(cachePath, 'utf8'));
  const outputSha256 = createHash('sha256').update(await readFile(output)).digest('hex');
  if (cache.inputSha256 === inputSha256 && cache.outputSha256 === outputSha256) {
    console.log(`[build-macos-helper] reused ${path.relative(desktopRoot, output)}`);
    process.exit(0);
  }
} catch (error) {
  if (!(error instanceof SyntaxError) && error.code !== 'ENOENT') throw error;
}

await mkdir(outputDirectory, { recursive: true });
for (const [executable, argumentsList] of [['xcrun', buildArguments], ['/usr/bin/codesign', signingArguments]]) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, argumentsList, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${executable} exited with code ${code ?? 'unknown'}`));
    });
  });
}
await writeFile(cachePath, JSON.stringify({
  inputSha256, outputSha256: createHash('sha256').update(await readFile(output)).digest('hex'),
}), 'utf8');

console.log(`[build-macos-helper] built ${path.relative(desktopRoot, output)}`);