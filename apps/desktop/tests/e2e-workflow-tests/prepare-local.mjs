import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { VitePlugin } from '@electron-forge/plugin-vite';
import { Listr } from 'listr2';

/** Builds the unpackaged production bundles consumed by the local Electron E2E driver. */
class LocalE2eBundleBuilder {
  /** Desktop workspace root shared by Forge Vite entries and output paths. */
  static desktopDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );

  /** Forge Vite entry definitions kept identical to forge.config.ts. */
  static vitePluginConfig = {
    build: [
      {
        entry: 'src/main/main.ts',
        config: path.join(this.desktopDirectory, 'vite.main.config.ts'),
        target: 'main',
      },
      {
        entry: 'src/preload/preload.ts',
        config: path.join(this.desktopDirectory, 'vite.preload.config.ts'),
        target: 'preload',
      },
    ],
    renderer: [
      {
        name: 'main_window',
        config: path.join(this.desktopDirectory, 'vite.renderer.config.ts'),
      },
    ],
  };

  /** Rebuild every production-mode bundle without invoking Electron Packager. */
  static async run() {
    if (process.platform === 'darwin' && process.env.INTERCEPTOR_E2E_MACOS_APP_PATH) {
      throw new Error('Run Playwright directly when validating an explicitly selected macOS App artifact.');
    }
    const vitePlugin = new VitePlugin(this.vitePluginConfig);
    vitePlugin.init(this.desktopDirectory);
    const prePackage = vitePlugin.getHooks().prePackage;
    if (!prePackage) throw new Error('Forge Vite plugin did not expose its production build hook.');
    const hooks = Array.isArray(prePackage) ? prePackage : [prePackage];
    await new Listr(hooks.map((hook) => ({
      title: 'Building production Vite bundles',
      task: (_context, task) => hook.call(task),
    })), { renderer: 'simple' }).run();
    console.log(`[e2e-workflow] local bundles ready: ${path.join(this.desktopDirectory, '.vite')}`);
  }
}

await LocalE2eBundleBuilder.run();
