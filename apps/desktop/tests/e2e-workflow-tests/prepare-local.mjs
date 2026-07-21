import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const require = createRequire(import.meta.url);
const ViteConfigGenerator = require(
  '@electron-forge/plugin-vite/dist/ViteConfig.js'
).default;

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
    const outputDirectory = path.join(this.desktopDirectory, '.vite');
    await rm(outputDirectory, { recursive: true, force: true });

    const generator = new ViteConfigGenerator(
      this.vitePluginConfig,
      this.desktopDirectory,
      true,
    );
    const [processConfigs, rendererConfigs] = await Promise.all([
      generator.getBuildConfigs(),
      generator.getRendererConfig(),
    ]);

    await Promise.all(
      [...processConfigs, ...rendererConfigs].map((config) =>
        this.buildTarget(config),
      ),
    );
    console.log(`[e2e-workflow] local bundles ready: ${outputDirectory}`);
  }

  /** Build one resolved Forge Vite target without recursively loading its config file. */
  static async buildTarget(config) {
    await build({
      configFile: false,
      logLevel: 'warn',
      ...config,
    });
  }
}

await LocalE2eBundleBuilder.run();
