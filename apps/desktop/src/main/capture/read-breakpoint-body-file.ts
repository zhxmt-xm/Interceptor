import { open } from 'node:fs/promises';
import path from 'node:path';

import { BODY_PREVIEW_MAX_BYTES, IMAGE_PREVIEW_MAX_BYTES, type BreakpointBodyFile } from '../../shared/desktop-api';
import { breakpointBodyMediaType } from '../utils';

export async function readBreakpointBodyFile(filePath: string): Promise<BreakpointBodyFile> {
  const mediaType = breakpointBodyMediaType(filePath);
  const handle = await open(filePath, 'r');
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error('The selected body path is not a regular file.');
    const file: BreakpointBodyFile = {
      path: filePath, name: path.basename(filePath), size: metadata.size, mediaType,
    };
    const image = mediaType.startsWith('image/') && mediaType !== 'image/svg+xml';
    const text = mediaType.startsWith('text/') || mediaType === 'image/svg+xml'
      || ['application/json', 'application/xml', 'application/yaml'].includes(mediaType);
    if ((!image && !text) || (image && metadata.size > IMAGE_PREVIEW_MAX_BYTES)) return file;
    const bytes = new Uint8Array(Math.min(metadata.size, image ? IMAGE_PREVIEW_MAX_BYTES : BODY_PREVIEW_MAX_BYTES));
    let received = 0;
    while (received < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, received, bytes.byteLength - received, received);
      if (bytesRead === 0) break;
      received += bytesRead;
    }
    return { ...file, preview: {
      bytes: received === bytes.byteLength ? bytes : bytes.slice(0, received),
      truncated: received < metadata.size,
    } };
  } finally {
    await handle.close();
  }
}
