import { Check, ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import type {
  AgentToolCallTranscriptItem,
  AgentToolResultTranscriptItem,
} from '../../../../shared/desktop-api';
import { AgentSessionActions, useAgentSessionStore } from '../data/agentSessionStore';
import { formatAgentToolArguments, summarizeAgentToolResult } from '../utils';
import { AgentToolResultSummary } from './AgentToolResultSummary';
import styles from './AgentToolApproval.module.css';

interface AgentToolApprovalProps {
  readonly call: AgentToolCallTranscriptItem;
  readonly result: AgentToolResultTranscriptItem | undefined;
}

/** Renders one persisted change Tool decision at its Transcript position. */
export function AgentToolApproval({
  call,
  result,
}: AgentToolApprovalProps): React.JSX.Element | null {
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
    const summary = result === undefined ? null : summarizeAgentToolResult(call.name, result.result);
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
        data-effect-metadata={approval.effectMetadata === undefined
          ? undefined
          : JSON.stringify(approval.effectMetadata)}
        data-parity="agent-tool-approval"
        data-tool-kind="change"
        data-tool-name={call.name}
        ref={resultRef}
        role="status"
        tabIndex={-1}
      >
        {allowed ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
        <strong>{label}</strong>
        <span
          className={styles.resultCopy}
          data-automation-id={AutomationIdFactory.agentToolResult(call.callId)}
          data-summary-kind={summary?.kind}
          data-storage-body-count={summary?.kind === 'storage' ? summary.bodyCount : undefined}
          data-storage-exchange-count={summary?.kind === 'storage' ? summary.exchangeCount : undefined}
          data-storage-total-bytes={summary?.kind === 'storage' ? summary.totalBytes : undefined}
          data-rule-revision={summary?.kind === 'rulesApplied' ? summary.revision : undefined}
          data-breakpoint-enabled={summary?.kind === 'breakpointConfig'
            ? summary.enabled
            : undefined}
          data-breakpoint-id={summary?.kind === 'breakpointResolution'
            ? summary.breakpointId
            : undefined}
          data-breakpoint-state={summary?.kind === 'breakpointResolution'
            ? summary.state
            : undefined}
          data-request-method={summary?.kind === 'request' ? summary.method : undefined}
          data-request-status={summary?.kind === 'request' ? summary.status : undefined}
          data-request-total-bytes={summary?.kind === 'request' ? summary.totalBytes : undefined}
          data-probe-ok={summary?.kind === 'probe' ? summary.ok : undefined}
          data-probe-protocol={summary?.kind === 'probe' && summary.ok
            ? summary.protocol
            : undefined}
          data-probe-certificate-count={summary?.kind === 'probe' && summary.ok
            ? summary.certificateCount
            : undefined}
        >
          <code>{call.name}</code>
          {allowed && summary !== null ? <AgentToolResultSummary summary={summary} /> : null}
        </span>
      </div>
    );
  }

  return (
    <section
      className={styles.approval}
      data-approval-id={approval.approvalId}
      data-approval-status={approval.status}
      data-automation-id={AutomationIdFactory.agentToolApproval(call.callId)}
      data-effect-metadata={approval.effectMetadata === undefined
        ? undefined
        : JSON.stringify(approval.effectMetadata)}
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