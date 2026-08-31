import { useEffect, useRef } from 'react';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { AgentSessionSnapshot } from '../../../../shared/desktop-api';
import { buildAgentTranscriptEntries } from '../utils';
import { AgentTurnResponse } from './AgentTurnResponse';
import styles from './AgentPanelTranscript.module.css';

interface AgentPanelTranscriptProps {
  readonly session: AgentSessionSnapshot;
}

/** Renders the Runtime-owned append-only Transcript in persisted Item order. */
export function AgentPanelTranscript({ session }: AgentPanelTranscriptProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const entries = buildAgentTranscriptEntries(session);

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
        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <div
                className={styles.userMessage}
                data-agent-item-id={entry.item.itemId}
                data-agent-item-kind={entry.item.kind}
                key={entry.item.itemId}
              >
                {entry.item.content}
              </div>
            );
          }
          return (
            <AgentTurnResponse
              items={entry.items}
              key={entry.turn.turnId}
              turn={entry.turn}
            />
          );
        })}
      </div>
    </div>
  );
}
