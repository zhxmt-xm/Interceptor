import { Check, ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import type { AgentToolCallTranscriptItem } from '../../../../shared/desktop-api';
import { AgentSessionActions, useAgentSessionStore } from '../data/agentSessionStore';
import { formatAgentToolArguments } from '../utils';
import styles from './AgentToolApproval.module.css';

interface AgentToolApprovalProps {
  readonly call: AgentToolCallTranscriptItem;
}

/** Renders one persisted change Tool decision at its Transcript position. */
export function AgentToolApproval({ call }: AgentToolApprovalProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const busy = useAgentSessionStore((state) => state.busy);
  const resultRef = useRef<HTMLDivElement>(null);
  const approval = call.approval;

  useEffect(() => {
    if (approval !== null && approval.status !== 'pending') {
      resultRef.current?.focus();
    }
  }, [approval?.status]);

  if (approval === null) return null;
  if (approval.status !== 'pending') {
    const allowed = approval.status === 'allowed';
    const label = allowed
      ? t('agent.toolAllowed')
      : approval.status === 'denied'
        ? t('agent.toolDenied')
        : t('agent.toolCancelled');
    return (
      <div
        aria-live="polite"
        className={styles.result}
        data-approval-status={approval.status}
        data-automation-id={AutomationIdFactory.agentToolApproval(call.callId)}
        data-tool-kind="change"
        data-tool-name={call.name}
        ref={resultRef}
        role="status"
        tabIndex={-1}
      >
        {allowed ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
        <strong>{label}</strong>
        <code>{call.name}</code>
      </div>
    );
  }

  return (
    <section
      className={styles.approval}
      data-approval-id={approval.approvalId}
      data-approval-status={approval.status}
      data-automation-id={AutomationIdFactory.agentToolApproval(call.callId)}
      data-parity="agent-tool-approval"
      data-tool-kind="change"
      data-tool-name={call.name}
    >
      <header className={styles.header}>
        <span className={styles.icon}><ShieldAlert aria-hidden="true" /></span>
        <div>
          <strong>{t('agent.allowThisTool')}</strong>
          <code>{call.name}</code>
        </div>
        <span className={styles.kind}>{t('agent.changeTool')}</span>
      </header>
      <div className={styles.body}>
        <p>{approval.description}</p>
        <dl>
          <div>
            <dt>{t('agent.tools.arguments')}</dt>
            <dd>{formatAgentToolArguments(call.arguments) ?? t('agent.tools.noParameters')}</dd>
          </div>
          <div><dt>{t('agent.toolEffect')}</dt><dd>{approval.effect}</dd></div>
        </dl>
      </div>
      <footer className={styles.actions}>
        <button
          data-automation-id={AutomationIdFactory.agentToolDeny(call.callId)}
          disabled={busy}
          type="button"
          onClick={() => void AgentSessionActions.denyToolCall(approval.approvalId)
            .catch(() => undefined)}
        >
          {t('agent.denyTool')}
        </button>
        <button
          className={styles.allow}
          data-automation-id={AutomationIdFactory.agentToolAllow(call.callId)}
          disabled={busy}
          type="button"
          onClick={() => void AgentSessionActions.allowToolCall(approval.approvalId)
            .catch(() => undefined)}
        >
          {t('agent.allowTool')}
        </button>
      </footer>
    </section>
  );
}