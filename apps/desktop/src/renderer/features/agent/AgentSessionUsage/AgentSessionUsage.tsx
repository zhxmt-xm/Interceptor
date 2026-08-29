import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { AgentSessionSnapshot } from '../../../../shared/desktop-api';
import { compactTokenCount } from '../utils';
import styles from './AgentSessionUsage.module.css';

interface AgentSessionUsageProps {
  readonly usage: AgentSessionSnapshot['usage'];
}

/** Displays exact Provider-reported Session token buckets and weighted cache rate. */
export function AgentSessionUsage({ usage }: AgentSessionUsageProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const cacheHitPercent = usage.cacheHitRate === null
    ? null
    : Math.round(usage.cacheHitRate * 1000) / 10;

  return (
    <div className={styles.usage}>
      <button
        aria-expanded={open}
        data-automation-id={AUTOMATION_IDS.agent.usage.toggle}
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{t('agent.sessionUsage')}</span>
        {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </button>
      {open ? (
        <div
          className={styles.popover}
          data-automation-id={AUTOMATION_IDS.agent.usage.panel}
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
