import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, preview } from 'vite';

export async function startDesignPreview(root, plugins = []) {
  // Concurrent previews must not replace the chunks behind an already loaded page.
  const outDir = await mkdtemp(path.join(tmpdir(), 'interceptor-design-preview-'));
  let previewServer = null;
  let closed = false;

  async function close() {
    if (closed) return;
    const errors = [];
    if (previewServer) {
      try {
        await new Promise((resolve, reject) => {
          previewServer.httpServer.close(error => error ? reject(error) : resolve());
        });
        previewServer = null;
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      await rm(outDir, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, 'Failed to close isolated design preview');
    closed = true;
  }

  try {
    await build({ root, plugins, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    previewServer = await preview({
      root,
      logLevel: 'silent',
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    const address = previewServer.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Vite preview did not expose a TCP port');
    return { url: `http://127.0.0.1:${address.port}/`, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Failed to start isolated design preview');
    }
    throw error;
  }
}