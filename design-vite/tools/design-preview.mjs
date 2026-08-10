import { build, preview } from 'vite';

export async function startDesignPreview(root) {
  await build({ root, logLevel: 'silent' });
  const previewServer = await preview({
    root,
    logLevel: 'silent',
    preview: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  });
  const address = previewServer.httpServer.address();
  if (!address || typeof address === 'string') {
    previewServer.httpServer.close();
    throw new Error('Vite preview did not expose a TCP port');
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => {
      previewServer.httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}