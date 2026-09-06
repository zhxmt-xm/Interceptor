import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoreRuntime } from '../../../core/core-runtime';
import { startDiagnosticsExport } from '../../start-export';

const { request, showSaveDialog } = vi.hoisted(() => ({ request: vi.fn(), showSaveDialog: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showSaveDialog } }));
vi.mock('../../../core/core-runtime', () => ({ CoreRuntime: vi.fn(function () { return { request }; }) }));

const job = {
  id: 'transfer-one', kind: 'diagnostics-export', state: 'running', fileName: 'diagnostics.jsonl',
  processed: 0, total: 0, startedAt: '2026-09-06T12:00:00.000Z', warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\exports\\diagnostics.jsonl' });
  request.mockResolvedValue({ type: 'transfer.job', payload: { job } });
});

describe('Diagnostics正式导出入口', () => {
  it('只使用原生选择的路径并沿正式Core任务传递过滤', async () => {
    const coreRuntime = new CoreRuntime();
    const filter = { process: 'core', level: 'info', outcome: 'success' } as const;
    const abortSignal = new AbortController().signal;

    await expect(startDiagnosticsExport(coreRuntime, filter, 'Export title', abortSignal)).resolves.toEqual(job);
    expect(showSaveDialog).toHaveBeenCalledExactlyOnceWith({
      title: 'Export title', defaultPath: expect.stringMatching(/^interceptor-diagnostics-\d{4}-\d{2}-\d{2}\.jsonl$/),
      filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }], properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    expect(request).toHaveBeenCalledExactlyOnceWith({
      type: 'diagnostics.export.start',
      payload: { ...filter, jobId: expect.stringMatching(/^transfer-/), filePath: 'C:\\exports\\diagnostics.jsonl' },
    }, { abortSignal });
  });

  it('原生取消返回null，不创建任务', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true });
    await expect(startDiagnosticsExport(new CoreRuntime(), {})).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it('预取消不打开原生选择', async () => {
    const abortController = new AbortController();
    abortController.abort();
    await expect(startDiagnosticsExport(new CoreRuntime(), {}, undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('迟到的路径在取消后不能启动导出', async () => {
    const abortController = new AbortController();
    showSaveDialog.mockImplementation(async () => {
      abortController.abort();
      return { canceled: false, filePath: 'C:\\exports\\late.jsonl' };
    });
    await expect(startDiagnosticsExport(new CoreRuntime(), {}, undefined, abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });

  it('Core失败不返回伪造的任务成功', async () => {
    request.mockRejectedValue(new Error('Core unavailable'));
    await expect(startDiagnosticsExport(new CoreRuntime(), {})).rejects.toThrow('Core unavailable');
  });

  it('已开始的任务保留原生命周期，不额外发送取消命令', async () => {
    const abortController = new AbortController();
    request.mockImplementation(async () => {
      abortController.abort();
      return { type: 'transfer.job', payload: { job } };
    });
    await expect(startDiagnosticsExport(new CoreRuntime(), {}, undefined, abortController.signal)).resolves.toEqual(job);
    expect(request).toHaveBeenCalledOnce();
  });
});