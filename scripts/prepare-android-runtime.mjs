import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const desktopDirectory = path.join(repositoryRoot, 'apps/desktop');
const androidRepository = path.resolve(repositoryRoot, '../Interceptor-Android');
const runtimeDirectory = path.join(desktopDirectory, '.runtime/android');
const releaseVersion = process.env.INTERCEPTOR_BUILD_VERSION;
const configuredApk = process.env.INTERCEPTOR_ANDROID_APK;
const apkSource = path.resolve(
  configuredApk ??
    path.join(androidRepository, 'app/build/outputs/apk/debug/app-debug.apk'),
);
const sdkDirectory = await resolveSdkDirectory();
const buildToolsDirectory = path.join(sdkDirectory, 'build-tools/35.0.0');
const platformToolsDirectory = path.join(sdkDirectory, 'platform-tools');
const expectedPlatformToolsRevision = '37.0.1';
const executableSuffix = process.platform === 'win32' ? '.exe' : '';

const packageMetadata = await readPackageMetadata();
if (releaseVersion && !configuredApk) {
  throw new Error('INTERCEPTOR_ANDROID_APK is required for a release package.');
}
const signer = await readSigner();
const signerSha256 = signer.sha256;
const expectedSigner = process.env.INTERCEPTOR_ANDROID_SIGNER_SHA256;
if (releaseVersion && !expectedSigner) {
  throw new Error('INTERCEPTOR_ANDROID_SIGNER_SHA256 is required for a release package.');
}
if (expectedSigner && (
  !/^[0-9a-f]{64}$/.test(expectedSigner) ||
  expectedSigner !== signerSha256
)) {
  throw new Error('Android APK signer does not match INTERCEPTOR_ANDROID_SIGNER_SHA256.');
}
if (releaseVersion && signer.subject.includes('CN=Android Debug')) {
  throw new Error('A release package cannot ship an Android Debug signing identity.');
}
const apkSha256 = await hashFile(apkSource);
const sourceProperties = await readFile(
  path.join(platformToolsDirectory, 'source.properties'),
  'utf8',
);
const revision = /^Pkg\.Revision=(.+)$/m.exec(sourceProperties)?.[1]?.trim();
if (revision !== expectedPlatformToolsRevision) {
  throw new Error(
    `Android platform-tools ${expectedPlatformToolsRevision} is required; found ${revision ?? 'unknown'}.`,
  );
}

const platformToolFiles = process.platform === 'win32'
  ? ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll', 'NOTICE.txt', 'source.properties']
  : ['adb', 'NOTICE.txt', 'source.properties'];

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(path.join(runtimeDirectory, 'platform-tools'), { recursive: true, mode: 0o755 });
const apkFile = 'Interceptor-Android.apk';
await copyFile(apkSource, path.join(runtimeDirectory, apkFile));
const platformFiles = [];
for (const fileName of platformToolFiles) {
  const source = path.join(platformToolsDirectory, fileName);
  const destination = path.join(runtimeDirectory, 'platform-tools', fileName);
  await copyFile(source, destination);
  if (fileName === `adb${executableSuffix}` && process.platform !== 'win32') {
    await chmod(destination, 0o755);
  }
  platformFiles.push({
    path: `platform-tools/${fileName}`,
    sha256: await hashFile(destination),
  });
}
await writeFile(
  path.join(runtimeDirectory, 'manifest.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    applicationId: 'com.zhxmt.interceptor.android',
    versionCode: packageMetadata.versionCode,
    versionName: packageMetadata.versionName,
    apkFile,
    apkSha256,
    signerSha256,
    platformTools: {
      revision,
      files: platformFiles,
    },
  }, null, 2)}\n`,
  'utf8',
);

console.log(
  `[prepare-android-runtime] ${packageMetadata.versionName} (${packageMetadata.versionCode}), ` +
  `${apkSha256}, platform-tools ${revision}`,
);

async function resolveSdkDirectory() {
  const configured = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (configured) return path.resolve(configured);
  const properties = await readFile(path.join(androidRepository, 'local.properties'), 'utf8');
  const sdk = /^sdk\.dir=(.+)$/m.exec(properties)?.[1]?.trim();
  if (!sdk) throw new Error('ANDROID_HOME is required to stage the Android runtime.');
  return sdk.replaceAll('\\\\', '\\').replaceAll('\\:', ':');
}

async function readPackageMetadata() {
  const aapt2 = path.join(buildToolsDirectory, `aapt2${executableSuffix}`);
  const { stdout } = await execFileAsync(aapt2, ['dump', 'badging', apkSource], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const packageLine = stdout.split(/\r?\n/)[0] ?? '';
  const match = /^package: name='com\.zhxmt\.interceptor\.android' versionCode='(\d+)' versionName='([^']+)'/.exec(
    packageLine,
  );
  if (!match) throw new Error('Android APK package metadata is invalid.');
  return { versionCode: Number(match[1]), versionName: match[2] };
}

async function readSigner() {
  const java = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java';
  const apksigner = path.join(buildToolsDirectory, 'lib/apksigner.jar');
  const { stdout } = await execFileAsync(java, [
    '-jar', apksigner, 'verify', '--print-certs', apkSource,
  ], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  const digests = [...stdout.matchAll(/Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})/g)]
    .map(match => match[1]);
  const subjects = [...stdout.matchAll(/Signer #\d+ certificate DN: (.+)/g)]
    .map(match => match[1].trim());
  if (digests.length !== 1 || subjects.length !== 1) {
    throw new Error('Android APK must contain exactly one verified signer.');
  }
  return { sha256: digests[0], subject: subjects[0] };
}

async function hashFile(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}
