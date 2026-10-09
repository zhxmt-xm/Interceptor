import { rm } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'esbuild';

/** Deterministic Proxy Core bundle builder with opt-in diagnostic source maps. */
class ProxyCoreBuilder {
  /** Workspace root used for stable entry and output paths. */
  static workspaceRoot = import.meta.dirname;
  /** TypeScript source root shared by all bundle entries. */
  static sourceRoot = path.join(this.workspaceRoot, 'src');
  /** Build output root copied into the Desktop package. */
  static outputRoot = path.join(this.workspaceRoot, 'dist');

  /** Rebuild all Core and Worker entries, then ship the traced runtime closure. */
  static async run() {
    await rm(this.outputRoot, { recursive: true, force: true });
    const result = await build({
      absWorkingDir: this.workspaceRoot,
      entryPoints: [
        path.join(this.sourceRoot, 'proxy-core/entry.cts'),
        path.join(this.sourceRoot, 'proxy-core/archive/worker/entry.ts'),
        path.join(this.sourceRoot, 'proxy-core/diagnostics/worker/entry.ts'),
      ],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node24',
      outdir: this.outputRoot,
      outbase: this.sourceRoot,
      outExtension: { '.js': '.cjs' },
      external: ['mockttp', 'ws', 'pac-proxy-agent'],
      sourcemap: process.env.INTERCEPTOR_SOURCEMAPS === '1',
      metafile: true,
    });
    const { shipCoreDependencies } = await import('../../scripts/ship-core-deps.mjs');
    await shipCoreDependencies(
      Object.keys(result.metafile.inputs).map((input) =>
        path.resolve(this.workspaceRoot, input)),
    );
  }
}

await ProxyCoreBuilder.run();