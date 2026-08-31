import { Progress } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { AgentSessionSnapshot } from '../../../../shared/desktop-api';
import { compactTokenCount } from '../utils';
import styles from './AgentSessionUsage.module.css';

interface AgentSessionUsageProps {
  readonly contextUsage: AgentSessionSnapshot['contextUsage'];
  readonly usage: AgentSessionSnapshot['usage'];
}

/** Shows Context usage and reveals exact Session token details on hover or focus. */
export function AgentSessionUsage({
  contextUsage,
  usage,
}: AgentSessionUsageProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const contextTokens = contextUsage.currentContextTokens ?? 0;
  const contextWindowTokens = contextUsage.contextWindowTokens;
  const contextPercent = contextWindowTokens === 0
    ? 0
    : Math.min(100, (contextTokens / contextWindowTokens) * 100);
  const cacheHitPercent = usage.cacheHitRate === null
    ? null
    : Math.round(usage.cacheHitRate * 1000) / 10;

  return (
    <div
      className={styles.usage}
      data-automation-id={AUTOMATION_IDS.agent.context}
      data-current-tokens={contextUsage.currentContextTokens ?? ''}
      data-max-output-tokens={contextUsage.maxOutputTokens}
      data-parity="agent-context-usage"
      data-source={contextUsage.source}
      data-window-tokens={contextWindowTokens}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        aria-expanded={open}
        aria-label={t('agent.context')}
        type="button"
      >
        <Progress
          percent={contextPercent}
          railColor="var(--border)"
          showInfo={false}
          size={18}
          strokeColor="var(--accent)"
          strokeWidth={11}
          type="circle"
        />
        <span className={styles.contextCopy}>
          <b>{t('agent.context')}</b>
          <code>{contextPercent.toFixed(1)}% · {compactTokenCount(contextTokens)} / {compactTokenCount(contextWindowTokens)}</code>
        </span>
      </button>
      {open ? (
        <div
          className={styles.popover}
          aria-label={t('agent.sessionUsage')}
          data-automation-id={AUTOMATION_IDS.agent.usage.panel}
          data-parity="agent-session-usage-popover"
          data-cache-hit-rate={usage.cacheHitRate ?? ''}
          data-cache-hit-tokens={usage.cacheHitInputTokens ?? ''}
          data-cache-miss-tokens={usage.cacheMissInputTokens ?? ''}
          data-input-tokens={usage.inputTokens ?? ''}
          data-model-call-count={usage.modelCallCount}
          data-output-tokens={usage.outputTokens ?? ''}
          data-total-tokens={usage.totalTokens ?? ''}
          role="status"
        >
          <header>
            <strong>{usage.totalTokens === null
              ? t('agent.usageUnavailable')
              : t('agent.tokenCount', { count: compactTokenCount(usage.totalTokens) })}</strong>
            <span>{cacheHitPercent === null ? t('agent.cacheUnavailable') : t('agent.cacheHitPercent', { percent: cacheHitPercent })}</span>
          </header>
          <dl>
            <div><dt>{t('agent.cacheHit')}</dt><dd>{usage.cacheHitInputTokens === null ? '—' : compactTokenCount(usage.cacheHitInputTokens)}</dd></div>
            <div><dt>{t('agent.cacheMiss')}</dt><dd>{usage.cacheMissInputTokens === null ? '—' : compactTokenCount(usage.cacheMissInputTokens)}</dd></div>
            <div><dt>{t('agent.output')}</dt><dd>{usage.outputTokens === null ? '—' : compactTokenCount(usage.outputTokens)}</dd></div>
          </dl>
          <small>{t('agent.usageModelCalls', { count: usage.modelCallCount })}</small>
        </div>
      ) : null}
    </div>
  );
}
