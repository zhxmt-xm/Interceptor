import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeRuntime } from '../../constants';
import { StorageService } from '../entry';

/**
 * 保存正文到用户选择的路径必须是原子替换：目标已存在时直接覆盖，
 * 失败或取消时**旧文件必须原样保留**。绝不允许先删除旧文件再重命名。
 */
describe('StorageService.exportBodyToFile', () => {
  let dataDir = '';
  let outputDir = '';
  let storage: StorageService | null = null;

  afterEach(async () => {
    await storage?.dispose();
    storage = null;
    for (const directory of [dataDir, outputDir]) {
      if (directory) {
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
  });

  /** 起一个真实 Store 并写入一段正文，返回它的内容寻址 hash。 */
  async function storeBody(content: string): Promise<{ hash: string }> {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-export-'));
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-export-out-'));
    initializeRuntime([`--data-dir=${dataDir}`]);
    storage = new StorageService();
    await storage.initialize();
    const { hash } = await storage.writeBody(
      (async function* stream() {
        yield Buffer.from(content, 'utf8');
      })(),
    );
    return { hash };
  }

  it('overwrites an existing destination in one step', async () => {
    const { hash } = await storeBody('new-body');
    const destination = path.join(outputDir, 'body.bin');
    await fs.writeFile(destination, 'previous-content', 'utf8');

    const result = await storage!.exportBodyToFile(
      hash,
      destination,
      new AbortController().signal,
      () => undefined,
    );

    expect(result.processed).toBe(8);
    await expect(fs.readFile(destination, 'utf8')).resolves.toBe('new-body');
    // 临时文件必须清理干净，不能在用户目录里留下 .tmp 残骸。
    await expect(fs.readdir(outputDir)).resolves.toEqual(['body.bin']);
  });

  it('leaves the existing file untouched when the export is cancelled', async () => {
    const { hash } = await storeBody('new-body');
    const destination = path.join(outputDir, 'body.bin');
    await fs.writeFile(destination, 'previous-content', 'utf8');
    const controller = new AbortController();
    controller.abort();

    await expect(
      storage!.exportBodyToFile(hash, destination, controller.signal, () => undefined),
    ).rejects.toThrow();

    await expect(fs.readFile(destination, 'utf8')).resolves.toBe('previous-content');
    await expect(fs.readdir(outputDir)).resolves.toEqual(['body.bin']);
  });
});
