const BODY_READ_CHUNK_BYTES = 1024 * 1024;

export interface CompleteBodyRead {
  bytes: Uint8Array;
  end: boolean;
  decodeStatus?: string;
}

/**
 * 无损读取指定正文范围。1MiB 只是一条 IPC 的调度块大小，循环没有总量上限。
 * content-encoding 解码需要完整压缩流，因此 decode 请求由 Core 一次完成。
 */
export async function readCompleteBody(
  bodyHash: string,
  offset: number,
  length: number,
  options?: { decode?: boolean; encoding?: string },
): Promise<CompleteBodyRead> {
  if (options?.decode) {
    const result = await window.interceptor.readBody(
      bodyHash,
      offset,
      length,
      options,
    );
    return {
      bytes: result.data,
      end: result.end,
      decodeStatus: result.decodeStatus,
    };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  let end = length === 0;
  while (total < length) {
    const chunk = await window.interceptor.readBody(
      bodyHash,
      offset + total,
      Math.min(BODY_READ_CHUNK_BYTES, length - total),
    );
    if (chunk.data.byteLength === 0) {
      end = true;
      break;
    }
    chunks.push(chunk.data);
    total += chunk.data.byteLength;
    end = chunk.end;
    if (chunk.end) {
      break;
    }
  }

  const bytes = new Uint8Array(total);
  let targetOffset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, targetOffset);
    targetOffset += chunk.byteLength;
  }
  return { bytes, end };
}