import { Bot, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type {
  AgentTranscriptItem,
  AgentTurnSnapshot,
} from '../../../../shared/desktop-api';
import { AgentSessionActions } from '../data/agentSessionStore';
import { buildAgentTurnContentBlocks } from '../utils';
import { AgentQueryToolTrace } from './AgentQueryToolTrace';
import { AgentToolApproval } from './AgentToolApproval';
import styles from './AgentTurnResponse.module.css';

interface AgentTurnResponseProps {
  readonly turn: AgentTurnSnapshot;
  readonly items: readonly Exclude<AgentTranscriptItem, { kind: 'user-message' }>[];
}

/** Renders one Turn as a single assistant response with ordered Tool activity. */
export function AgentTurnResponse({ turn, items }: AgentTurnResponseProps): React.JSX.Element {
  const { t } = useTranslation();
  const retryable = turn.status === 'cancelled' || turn.status === 'failed';
  const blocks = buildAgentTurnContentBlocks(items);

  return (
    <article className={styles.assistantMessage} data-agent-turn-id={turn.turnId}>
      <span className={styles.avatar}><Bot aria-hidden="true" /></span>
      <div className={styles.response}>
        {blocks.map((block, index) => {
          if (block.kind === 'assistant') {
            const item = block.item;
            return (
              <div
                className={styles.markdown}
                data-agent-item-id={item.itemId}
                data-agent-item-kind={item.kind}
                key={item.itemId}
              >
                {item.reasoningContent ? (
                  <details
                    className={styles.reasoning}
                    data-automation-id={AUTOMATION_IDS.agent.reasoning}
                  >
                    <summary>{t('agent.reasoning')}</summary>
                    <p>{item.reasoningContent}</p>
                  </details>
                ) : null}
                {item.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                ) : null}
              </div>
            );
          }
          const queryCalls = block.calls.filter((call) => call.approval === null);
          const queryCallIds = new Set(queryCalls.map((call) => call.callId));
          const queryResults = block.results.filter((result) => queryCallIds.has(result.callId));
          const approvalCalls = block.calls.filter((call) => call.approval !== null);
          return (
            <div className={styles.toolActivity} key={`tools-${turn.turnId}-${index}`}>
              {queryCalls.length > 0 ? (
                <AgentQueryToolTrace calls={queryCalls} results={queryResults} />
              ) : null}
              {approvalCalls.map((call) => (
                <AgentToolApproval call={call} key={call.itemId} />
              ))}
            </div>
          );
        })}
        {turn.status === 'running' ? (
          <span className={styles.progress}>{t('agent.generating')}</span>
        ) : null}
        {retryable ? (
          <div className={styles.notice} data-tone={turn.status === 'failed' ? 'error' : 'default'}>
            <strong>{t(turn.status === 'failed' ? 'agent.requestFailed' : 'agent.responseStopped')}</strong>
            <span>{t(turn.status === 'failed' ? 'agent.requestFailedDescription' : 'agent.responseStoppedDescription')}</span>
            <button
              data-automation-id={AUTOMATION_IDS.agent.turn.retry}
              type="button"
              onClick={() => void AgentSessionActions.retry(turn.turnId).catch(() => undefined)}
            >
              <RefreshCw aria-hidden="true" />
              {t('agent.retryResponse')}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
