import { Bot, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { AgentSessionSnapshot } from '../../../../shared/desktop-api';
import { AgentSessionActions } from '../data/agentSessionStore';
import styles from './AgentPanelTranscript.module.css';

interface AgentPanelTranscriptProps {
  readonly session: AgentSessionSnapshot;
}

/** Renders the Runtime-owned append-only Transcript in persisted Item order. */
export function AgentPanelTranscript({ session }: AgentPanelTranscriptProps): React.JSX.Element {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll !== null) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, [session.sequence]);

  return (
    <div
      className={styles.scroll}
      data-automation-id={AUTOMATION_IDS.agent.session.transcript}
      data-parity="agent-transcript"
      ref={scrollRef}
    >
      <div className={styles.transcript}>
        {session.items.map((item) => {
          if (item.kind === 'user-message') {
            return (
              <div
                className={styles.userMessage}
                data-agent-item-id={item.itemId}
                data-agent-item-kind={item.kind}
                key={item.itemId}
              >
                {item.content}
              </div>
            );
          }
          const turn = session.turns.find((entry) => entry.turnId === item.turnId);
          const retryable = turn?.status === 'cancelled' || turn?.status === 'failed';
          return (
            <article
              className={styles.assistantMessage}
              data-agent-item-id={item.itemId}
              data-agent-item-kind={item.kind}
              key={item.itemId}
            >
              <span className={styles.avatar}><Bot aria-hidden="true" /></span>
              <div className={styles.response}>
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
                {turn?.status === 'running' ? (
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
        })}
      </div>
    </div>
  );
}
