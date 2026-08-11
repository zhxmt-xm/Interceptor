import { useEffect } from 'react';

import { collectLeafIds } from '@interceptor/core-protocol';

import type { RuleActionType } from '../../../../shared/desktop-api';
import { useRulesStore } from './rulesStore';
import type { BreakpointScope } from '../interfaces';
import { createBreakpointRule, createRuleFromRequest } from '../utils';

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

/**
 * 从 Capture 请求直接创建断点规则：**创建即启用即 Apply**。
 *
 * 改写规则默认不启用是因为字段还没填完，而断点 matcher 全部来自真实请求，
 * 不存在未填完；把“临时拦一下”做成先存草稿再手动 Apply 的配置流程是错的。
 * 当前这条已完成的请求不会被追溢暂停，只影响未来流量。
 */
export async function addBreakpointRule(
  name: string,
  url: string,
  scope: BreakpointScope,
): Promise<string | null> {
  await ensureRulesLoaded();
  const store = useRulesStore.getState();
  if (!store.initialized) {
    return null;
  }
  const rule = createBreakpointRule(name, url, scope);
  store.addRuleDraft(rule);
  return await applyRules() ? rule.id : null;
}

/** 撤销刚创建的断点规则；删除后立即 Apply，不留下未生效的草稿。 */
export async function removeBreakpointRule(ruleId: string): Promise<boolean> {
  useRulesStore.getState().removeNode(ruleId);
  return applyRules();
}

/** 切换一条断点规则的启用状态并立即 Apply；manager 里的开关必须即时影响真实流量。 */
export async function toggleBreakpointRule(ruleId: string): Promise<void> {
  useRulesStore.getState().toggleRule(ruleId);
  await applyRules();
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
export async function applyRules(): Promise<boolean> {
  const api = window.interceptor;
  if (!api?.replaceRules) {
    return false;
  }
  const store = useRulesStore.getState();
  if (store.saving) {
    return false;
  }
  store.beginSave();
  try {
    const result = await api.replaceRules(store.revision, store.nodes);
    if (result.ok) {
      useRulesStore.getState().saveSucceeded(result.revision);
      void loadRuleHits();
      return true;
    }
    useRulesStore
      .getState()
      .saveFailed(result.message, result.reason === 'conflict');
    return false;
  } catch (error) {
    useRulesStore.getState().saveFailed(describeError(error), false);
    return false;
  }
}

/** 把整棵规则树导出成 JSON 文件；落盘路径由 Main 的系统对话框选择。 */
export async function exportRules(title: string): Promise<void> {
  const api = window.interceptor;
  if (!api?.exportRules) {
    return;
  }
  await api.exportRules(useRulesStore.getState().nodes, title);
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
