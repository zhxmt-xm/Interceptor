import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportCollection } from '../../export-collection';

const { showSaveDialog, writeFile } = vi.hoisted(() => ({ showSaveDialog: vi.fn(), writeFile: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showSaveDialog } }));
vi.mock('node:fs/promises', () => ({ writeFile }));

beforeEach(() => {
  vi.resetAllMocks();
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\exports\\collection.json' });
  writeFile.mockResolvedValue(undefined);
});

describe('Collection文件导出', () => {
  it('只写入原生选择路径并保留JSON树结构', async () => {
    const nodes = [{ kind: 'folder' as const, id: 'group', name: 'Group', children: [] }];
    await expect(exportCollection(nodes, 'Export title')).resolves.toBe(true);
    expect(showSaveDialog).toHaveBeenCalledExactlyOnceWith({
      title: 'Export title', defaultPath: expect.stringMatching(/^interceptor-collection-\d{4}-\d{2}-\d{2}\.json$/),
      filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    expect(writeFile).toHaveBeenCalledExactlyOnceWith('C:\\exports\\collection.json', JSON.stringify({ nodes }, null, 2), 'utf8');
  });

  it('取消原生Dialog不写文件', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true });
    await expect(exportCollection([])).resolves.toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('已取消请求不打开Dialog', async () => {
    const abortController = new AbortController();
    abortController.abort();
    await expect(exportCollection([], undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(showSaveDialog).not.toHaveBeenCalled();
  });

  it('取消后的迟到文件选择不写入', async () => {
    const abortController = new AbortController();
    showSaveDialog.mockImplementation(async () => { abortController.abort(); return { canceled: false, filePath: 'late.json' }; });
    await expect(exportCollection([], undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('写入已经开始时按正式路径完成', async () => {
    const abortController = new AbortController();
    writeFile.mockImplementation(async () => { abortController.abort(); });
    await expect(exportCollection([], undefined, abortController.signal)).resolves.toBe(true);
  });
});