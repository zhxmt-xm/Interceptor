// 用 @vercel/nft 追踪 Proxy Core `entry.cjs` 运行时真正需要的依赖文件（含
// `.wasm`、`.node` 等二进制），按 node_modules 结构拷贝到 `dist/proxy-core/node_modules/`。
//
// 背景：`mockttp` 依赖含 WASM（brotli-wasm）与原生插件（tls-impersonate 的 .node），
// 无法被 esbuild 内联进单文件。因此 esbuild 以 `--external:mockttp` 保留 require，
// 由本脚本把其运行时闭包随包发到 entry.cjs 同级 node_modules，Node 即可正常解析。
// Forge 的 extraResource 递归复制整个 dist/proxy-core，所以拷进去即自动随包发布。
//
// nft 的静态追踪抓不到 node-gyp-build 运行时按平台计算路径加载的 `.node`，因此在
// nft 之后再对每个随包依赖补拷 `prebuilds/` 与 `build/Release/*.node` 原生资源。

import { nodeFileTrace } from '@vercel/nft';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const coreDist = path.join(repoRoot, 'apps/proxy-core/dist/proxy-core');
const entryFile = path.join(coreDist, 'entry.cjs');

async function main() {
  await fs.access(entryFile).catch(() => {
    throw new Error(`Missing ${entryFile}; run esbuild build first.`);
  });

  const { fileList } = await nodeFileTrace([entryFile], { base: repoRoot });

  const shippedPackages = new Set();
  let copied = 0;
  let bytes = 0;

  for (const relative of fileList) {
    const normalized = relative.split('/').join(path.sep);
    const fromNodeModules = sliceFromNodeModules(normalized);
    if (!fromNodeModules) {
      continue; // 只搬运 node_modules 内的第三方依赖；自己的代码已被 esbuild 内联。
    }

    const dest = path.join(coreDist, fromNodeModules);
    await copyFile(path.join(repoRoot, normalized), dest);
    copied += 1;
    bytes += (await fs.stat(dest)).size;

    const root = packageRootOf(fromNodeModules);
    if (root) {
      shippedPackages.add(root);
    }
  }

  // 补拷 nft 漏掉的原生二进制（node-gyp-build prebuilds / build 产物）。
  let nativeAdded = 0;
  for (const root of shippedPackages) {
    nativeAdded += await copyNativeAssets(
      path.join(repoRoot, root),
      path.join(coreDist, root),
    );
  }

  const [nodeAddons, wasmAssets] = await countBinaries(
    path.join(coreDist, 'node_modules'),
  );
  const mib = (bytes / 1024 / 1024).toFixed(2);
  process.stdout.write(
    `[ship-core-deps] copied ${copied} traced files (${mib} MiB) + ${nativeAdded} native assets ` +
      `into dist/proxy-core/node_modules; total .node=${nodeAddons}, .wasm=${wasmAssets}\n`,
  );

  const shippedRequire = createRequire(path.join(coreDist, 'entry.cjs'));
  try {
    shippedRequire.resolve('mockttp');
  } catch {
    throw new Error('mockttp is not resolvable from the shipped node_modules.');
  }
}

/** 返回相对路径中从第一个 node_modules 段开始的子路径，保留嵌套结构，若无则返回 null。 */
function sliceFromNodeModules(normalized) {
  const parts = normalized.split(path.sep);
  const index = parts.indexOf('node_modules');
  return index < 0 ? null : parts.slice(index).join(path.sep);
}

/** 从 `node_modules/...` 子路径解析包根（含 @scope）。 */
function packageRootOf(fromNodeModules) {
  const parts = fromNodeModules.split(path.sep); // ['node_modules', name, ...]
  if (parts.length < 2) {
    return null;
  }
  const scoped = parts[1].startsWith('@');
  return parts.slice(0, scoped ? 3 : 2).join(path.sep);
}

async function copyFile(source, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
}

/** 补拷一个包的 prebuilds/ 与 build/Release/*.node；返回新增文件数。 */
async function copyNativeAssets(sourcePkg, destPkg) {
  let added = 0;
  for (const dir of ['prebuilds', path.join('build', 'Release')]) {
    const source = path.join(sourcePkg, dir);
    if (await exists(source)) {
      const dest = path.join(destPkg, dir);
      await fs.cp(source, dest, { recursive: true, force: true });
      added += await countFiles(dest);
    }
  }
  return added;
}

async function countBinaries(root) {
  let node = 0;
  let wasm = 0;
  for await (const file of walk(root)) {
    if (file.endsWith('.node')) node += 1;
    if (file.endsWith('.wasm')) wasm += 1;
  }
  return [node, wasm];
}

async function countFiles(root) {
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _file of walk(root)) {
    count += 1;
  }
  return count;
}

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function exists(target) {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

main().catch((error) => {
  process.stderr.write(`[ship-core-deps] ${error.message}\n`);
  process.exitCode = 1;
});
