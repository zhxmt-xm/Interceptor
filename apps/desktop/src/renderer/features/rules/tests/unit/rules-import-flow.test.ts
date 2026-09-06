import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RulesImportActions } from '../../data/rulesImportActions';
import { useRulesImportStore } from '../../data/rulesImportStore';
import { useRulesStore } from '../../data/rulesStore';

const { analyzeRuleImport, importRules, ensureRulesLoaded } = vi.hoisted(() => ({
  analyzeRuleImport: vi.fn(), importRules: vi.fn(), ensureRulesLoaded: vi.fn(),
}));

vi.mock('../../data/useRulesData', () => ({ analyzeRuleImport, importRules, ensureRulesLoaded }));

const preview = {
  ok: true as const, fileName: 'rules.json', nodes: [{ kind: 'folder' as const, id: 'fresh-folder', name: 'Folder', children: [] }],
  folderCount: 1, leafCount: 2, enabledCount: 1, skipped: [],
};

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  useRulesStore.setState(useRulesStore.getInitialState(), true);
  useRulesStore.getState().loadRuleSet({ revision: 1, nodes: [] });
  useRulesImportStore.setState(useRulesImportStore.getInitialState(), true);
  ensureRulesLoaded.mockResolvedValue(undefined);
  analyzeRuleImport.mockResolvedValue(preview);
  importRules.mockImplementation(async () => {
    useRulesStore.setState({ revision: 2 });
    return true;
  });
});

describe('Rules import flow', () => {
  it('connects typed Main requests to the same preview and acknowledges only completed requests', async () => {
    let requestImport!: (requestId: string) => void;
    const stopRequests = vi.fn();
    const stopCancellations = vi.fn();
    const completeRulesImport = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { interceptor: {
      onRulesImportRequested: (listener: typeof requestImport) => { requestImport = listener; return stopRequests; },
      onRulesImportCanceled: () => stopCancellations,
      completeRulesImport,
    } });
    const rulesImportActions = new RulesImportActions();
    const unsubscribe = rulesImportActions.subscribe(() => 'Import title');

    requestImport('request-1');
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('preview'));
    await rulesImportActions.confirmImport();
    await vi.waitFor(() => expect(completeRulesImport).toHaveBeenCalledExactlyOnceWith('request-1', {
      status: 'completed', result: { imported: true, revision: 2, ruleCount: 2, folderCount: 1, enabledCount: 1, skippedCount: 0 },
    }));
    unsubscribe();
    expect(stopRequests).toHaveBeenCalledOnce();
    expect(stopCancellations).toHaveBeenCalledOnce();
  });

  it('correlates Main cancellation without acknowledging or canceling a different request', async () => {
    let requestImport!: (requestId: string) => void;
    let cancelImport!: (requestId: string) => void;
    const completeRulesImport = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { interceptor: {
      onRulesImportRequested: (listener: typeof requestImport) => { requestImport = listener; return vi.fn(); },
      onRulesImportCanceled: (listener: typeof cancelImport) => { cancelImport = listener; return vi.fn(); },
      completeRulesImport,
    } });
    const rulesImportActions = new RulesImportActions();
    const unsubscribe = rulesImportActions.subscribe(() => 'Import title');
    requestImport('request-1');
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('preview'));
    cancelImport('other-request');
    expect(useRulesImportStore.getState().phase).toBe('preview');
    cancelImport('request-1');
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('idle'));
    expect(completeRulesImport).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('loads the baseline and reads once before showing the shared preview without saving', async () => {
    const rulesImportActions = new RulesImportActions();
    const result = rulesImportActions.startImport('Import Rules', new AbortController().signal);
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('preview'));

    expect(ensureRulesLoaded).toHaveBeenCalledOnce();
    expect(analyzeRuleImport).toHaveBeenCalledExactlyOnceWith('Import Rules');
    expect(useRulesImportStore.getState().preview).toEqual(preview);
    expect(importRules).not.toHaveBeenCalled();
    rulesImportActions.cancelImport();
    await expect(result).resolves.toEqual({ status: 'completed', result: { imported: false } });
  });

  it('completes native cancellation without showing a preview or saving', async () => {
    analyzeRuleImport.mockResolvedValue(null);
    const rulesImportActions = new RulesImportActions();

    await expect(rulesImportActions.startImport('Import Rules', new AbortController().signal))
      .resolves.toEqual({ status: 'completed', result: { imported: false } });
    expect(useRulesImportStore.getState()).toMatchObject({ phase: 'idle', preview: null });
    expect(importRules).not.toHaveBeenCalled();
  });

  it('confirms the same preview through the existing atomic import and returns only its counters', async () => {
    const rulesImportActions = new RulesImportActions();
    const result = rulesImportActions.startImport('Import Rules', new AbortController().signal);
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('preview'));

    await rulesImportActions.confirmImport();

    expect(importRules).toHaveBeenCalledExactlyOnceWith(preview.nodes);
    expect(analyzeRuleImport).toHaveBeenCalledOnce();
    await expect(result).resolves.toEqual({ status: 'completed', result: {
      imported: true, revision: 2, ruleCount: 2, folderCount: 1, enabledCount: 1, skippedCount: 0,
    } });
    expect(useRulesImportStore.getState()).toMatchObject({ phase: 'idle', preview: null });
  });

  it('does not confirm the same preview twice while saving', async () => {
    let finishSave!: (saved: boolean) => void;
    importRules.mockReturnValue(new Promise<boolean>((resolve) => { finishSave = resolve; }));
    const rulesImportActions = new RulesImportActions();
    const result = rulesImportActions.startImport('Import Rules', new AbortController().signal);
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('preview'));
    const firstSave = rulesImportActions.confirmImport();
    await rulesImportActions.confirmImport();

    expect(importRules).toHaveBeenCalledOnce();
    expect(useRulesImportStore.getState().phase).toBe('saving');
    finishSave(true);
    await firstSave;
    await expect(result).resolves.toMatchObject({ status: 'completed', result: { imported: true } });
  });

  it('rejects concurrent preparation without replacing the current preview', async () => {
    const rulesImportActions = new RulesImportActions();
    const first = rulesImportActions.startImport('First', new AbortController().signal);
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('preview'));

    await expect(rulesImportActions.startImport('Second', new AbortController().signal)).resolves.toEqual({ status: 'failed' });
    expect(analyzeRuleImport).toHaveBeenCalledOnce();
    expect(useRulesImportStore.getState().preview).toEqual(preview);
    rulesImportActions.cancelImport();
    await first;
  });

  it('does not start a flow whose request has already been aborted', async () => {
    const rulesImportActions = new RulesImportActions();
    const abortController = new AbortController();
    abortController.abort();

    await expect(rulesImportActions.startImport('Import Rules', abortController.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(ensureRulesLoaded).not.toHaveBeenCalled();
    expect(analyzeRuleImport).not.toHaveBeenCalled();
  });

  it('ignores a late file selection after cancellation without disturbing the next preview', async () => {
    let finishRead!: (value: typeof preview) => void;
    analyzeRuleImport.mockReturnValueOnce(new Promise((resolve) => { finishRead = resolve; }));
    const rulesImportActions = new RulesImportActions();
    const abortController = new AbortController();
    const first = rulesImportActions.startImport('First', abortController.signal);
    await vi.waitFor(() => expect(analyzeRuleImport).toHaveBeenCalledOnce());
    abortController.abort();
    await expect(first).resolves.toEqual({ status: 'completed', result: { imported: false } });
    const nextPreview = { ...preview, fileName: 'newer.json' };
    analyzeRuleImport.mockResolvedValueOnce(nextPreview);
    const second = rulesImportActions.startImport('Second', new AbortController().signal);
    await vi.waitFor(() => expect(useRulesImportStore.getState().preview).toEqual(nextPreview));
    finishRead(preview);
    await Promise.resolve();
    expect(useRulesImportStore.getState().preview).toEqual(nextPreview);
    expect(importRules).not.toHaveBeenCalled();
    rulesImportActions.cancelImport();
    await second;
  });

  it('keeps a failed save available for user cancellation without changing the preview', async () => {
    importRules.mockResolvedValue(false);
    const rulesImportActions = new RulesImportActions();
    const result = rulesImportActions.startImport('Import Rules', new AbortController().signal);
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('preview'));
    await rulesImportActions.confirmImport();

    expect(useRulesImportStore.getState()).toMatchObject({ phase: 'preview', preview, errorKey: 'rules.import.failed' });
    rulesImportActions.cancelImport();
    await expect(result).resolves.toEqual({ status: 'completed', result: { imported: false } });
  });

  it('finishes an atomic save that was already started when the request was canceled', async () => {
    let finishSave!: (saved: boolean) => void;
    importRules.mockReturnValue(new Promise<boolean>((resolve) => { finishSave = resolve; }));
    const rulesImportActions = new RulesImportActions();
    const abortController = new AbortController();
    const result = rulesImportActions.startImport('Import Rules', abortController.signal);
    await vi.waitFor(() => expect(useRulesImportStore.getState().phase).toBe('preview'));
    const saving = rulesImportActions.confirmImport();
    abortController.abort();
    expect(useRulesImportStore.getState().phase).toBe('saving');
    finishSave(true);
    await saving;
    await expect(result).resolves.toMatchObject({ status: 'completed', result: { imported: true } });
  });

  it('reports invalid files without exposing content to the request result', async () => {
    analyzeRuleImport.mockResolvedValue({ ok: false, reason: 'invalid-json' });
    const rulesImportActions = new RulesImportActions();

    await expect(rulesImportActions.startImport('Import Rules', new AbortController().signal)).resolves.toEqual({ status: 'failed' });
    expect(useRulesImportStore.getState()).toMatchObject({ phase: 'idle', preview: null, errorKey: 'import.reason.invalid-json' });
    expect(importRules).not.toHaveBeenCalled();
  });

  it('does not open a file if the initial Rule baseline could not be loaded', async () => {
    useRulesStore.setState({ initialized: false });
    const rulesImportActions = new RulesImportActions();

    await expect(rulesImportActions.startImport('Import Rules', new AbortController().signal)).resolves.toEqual({ status: 'failed' });
    expect(analyzeRuleImport).not.toHaveBeenCalled();
    expect(useRulesImportStore.getState().errorKey).toBe('rules.import.readFailed');
  });
});