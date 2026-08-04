import { useEffect } from 'react';

import { collectLeafIds } from '@interceptor/core-protocol';

import type { RuleActionType } from '../../../../shared/desktop-api';
import { useRulesStore } from './rulesStore';
import { createRuleFromRequest } from '../utils';

const HITS_POLL_INTERVAL_MS = 4_000;
let initialLoad: Promise<void> | null = null;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 拉取当前规则集并载入草稿；供挂载与冲突后重载调用。 */
export async function loadRules(): Promise<void> {
  const api = window.interceptor;
  if (!api?.getRules) {
    return;
  }
  useRulesStore.getState().beginLoad();
  try {
    const ruleSet = await api.getRules();
    useRulesStore.getState().loadRuleSet(ruleSet);
  } catch (error) {
    useRulesStore.getState().loadFailed(describeError(error));
  }
}

/** 首次跨 feature 使用 Rules 前只发起一次加载，避免并发结果覆盖新草稿。 */
export function ensureRulesLoaded(): Promise<void> {
  if (useRulesStore.getState().initialized) {
    return Promise.resolve();
  }
  initialLoad ??= loadRules().finally(() => {
    initialLoad = null;
  });
  return initialLoad;
}

/** 创建一条由 Capture 请求派生的未应用规则草稿。 */
export async function addRequestRuleDraft(
  name: string,
  url: string,
  actionType: RuleActionType,
): Promise<string | null> {
  await ensureRulesLoaded();
  const store = useRulesStore.getState();
  if (!store.initialized) {
    return null;
  }
  const rule = createRuleFromRequest(name, url, actionType);
  store.addRuleDraft(rule);
  return rule.id;
}

/** 选择一条仍存在的规则；已删除的历史 marker 不触发导航。 */
export async function selectRuleDraft(ruleId: string): Promise<boolean> {
  await ensureRulesLoaded();
  const store = useRulesStore.getState();
  if (!collectLeafIds(store.nodes).includes(ruleId)) {
    return false;
  }
  store.select(ruleId);
  return true;
}

/** 拉取规则命中计数；失败静默（命中计数为增强信息，不阻塞编辑）。 */
export async function loadRuleHits(): Promise<void> {
  const api = window.interceptor;
  if (!api?.getRuleHits) {
    return;
  }
  try {
    const counts = await api.getRuleHits();
    useRulesStore.getState().setHits(counts);
  } catch {
    /* 命中计数不可用时保持既有值。 */
  }
}

/**
 * 应用当前草稿：乐观并发 replaceRules。成功后更新 revision 并刷新命中计数。
 *
 * 冲突（他处已改）时**保留本地草稿与冲突提示**，不自动重载：草稿是用户刚写的，
 * 静默覆盖等于丢工作。用户看到提示后可显式 Reload 放弃草稿、取回最新规则集。
 */
export async function applyRules(): Promise<void> {
  const api = window.interceptor;
  if (!api?.replaceRules) {
    return;
  }
  const store = useRulesStore.getState();
  if (store.saving) {
    return;
  }
  store.beginSave();
  try {
    const result = await api.replaceRules(store.revision, store.nodes);
    if (result.ok) {
      useRulesStore.getState().saveSucceeded(result.revision);
      void loadRuleHits();
      return;
    }
    useRulesStore
      .getState()
      .saveFailed(result.message, result.reason === 'conflict');
  } catch (error) {
    useRulesStore.getState().saveFailed(describeError(error), false);
  }
}

/**
 * Rules workspace 数据管线：挂载时加载规则集与命中计数，并周期刷新命中计数。
 * 规则完整性在本地纯函数即时派生，不往返 Core。挂载一次。
 */
export function useRulesData(): void {
  // 挂载时加载规则集与命中计数。
  useEffect(() => {
    void ensureRulesLoaded();
    void loadRuleHits();
  }, []);

  // 周期刷新命中计数（捕获运行时命中会增长）。
  useEffect(() => {
    const handle = setInterval(() => {
      void loadRuleHits();
    }, HITS_POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, []);
}
