import { CheckCircle2, CircleAlert, LoaderCircle, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import type {
  AgentToolCallTranscriptItem,
  AgentToolResultTranscriptItem,
} from '../../../../shared/desktop-api';
import {
  formatAgentToolArguments,
  summarizeAgentToolResult,
} from '../utils';
import { AgentToolResultSummary } from './AgentToolResultSummary';
import styles from './AgentQueryToolTrace.module.css';

interface AgentQueryToolTraceProps {
  readonly calls: readonly AgentToolCallTranscriptItem[];
  readonly results: readonly AgentToolResultTranscriptItem[];
}

/** Renders completed and running query Tool calls as one ordered activity log. */
export function AgentQueryToolTrace({ calls, results }: AgentQueryToolTraceProps): React.JSX.Element {
  const { t } = useTranslation();
  const resultByCallId = new Map(results.map((result) => [result.callId, result]));
  const completedCount = calls.filter((call) => call.status === 'completed').length;

  return (
    <section
      aria-label={t('agent.tools.activity')}
      className={styles.toolTrace}
      data-automation-id={AUTOMATION_IDS.agent.tools.activity}
      data-parity="agent-query-tool-trace"
    >
      <header className={styles.toolTraceHeader}>
        <span><Wrench aria-hidden="true" /><strong>{t('agent.tools.activity')}</strong></span>
        <small>{t('agent.tools.completed', { count: completedCount })}</small>
      </header>
      <ol>
        {calls.map((call) => {
          const result = resultByCallId.get(call.callId);
          const argumentsText = formatAgentToolArguments(call.arguments);
          const summary = result === undefined ? null : summarizeAgentToolResult(call.name, result.result);
          return (
            <li
              data-automation-id={AutomationIdFactory.agentToolCall(call.callId)}
              data-tool-call-id={call.callId}
              data-tool-name={call.name}
              data-tool-status={call.status}
              key={call.itemId}
            >
              <span className={styles.toolTraceStatus} data-status={call.status}>
                {call.status === 'running' ? (
                  <LoaderCircle aria-label={t('agent.tools.running')} />
                ) : call.status === 'failed' ? (
                  <CircleAlert aria-label={t('agent.tools.failed')} />
                ) : (
                  <CheckCircle2 aria-label={t('agent.tools.complete')} />
                )}
              </span>
              <div className={styles.toolTraceCopy}>
                <code>{call.name}</code>
                <span>
                  <b>{t('agent.tools.arguments')}</b>
                  {argumentsText ?? t('agent.tools.noParameters')}
                </span>
                <span
                  data-automation-id={AutomationIdFactory.agentToolResult(call.callId)}
                  data-summary-kind={summary?.kind}
                  data-transfer-job-id={summary?.kind === 'diagnosticsExport' || summary?.kind === 'transferJob' ? summary.jobId : undefined}
                  data-transfer-job-state={summary?.kind === 'diagnosticsExport' || summary?.kind === 'transferJob' ? summary.state : undefined}
                  data-transfer-job-processed={summary?.kind === 'transferJob' ? summary.processed : undefined}
                  data-transfer-job-total={summary?.kind === 'transferJob' ? summary.total : undefined}
                  data-transfer-job-warning-count={summary?.kind === 'transferJob' ? summary.warningCount : undefined}
                  data-resolved-count={summary?.kind === 'breakpointBatch' ? summary.count : undefined}
                  data-storage-body-count={summary?.kind === 'storage' ? summary.bodyCount : undefined}
                  data-storage-exchange-count={summary?.kind === 'storage' ? summary.exchangeCount : undefined}
                  data-storage-total-bytes={summary?.kind === 'storage' ? summary.totalBytes : undefined}
                  data-body-bytes-read={summary?.kind === 'body' && !summary.opaque ? summary.bytesRead : undefined}
                  data-body-end={summary?.kind === 'body' && !summary.opaque ? summary.end : undefined}
                  data-body-opaque={summary?.kind === 'body' ? summary.opaque : undefined}
                  data-message-count={summary?.kind === 'websocket' || summary?.kind === 'grpc' ? summary.count : undefined}
                  data-message-has-more={summary?.kind === 'websocket' || summary?.kind === 'grpc' ? summary.hasMore : undefined}
                  data-grpc-recognized={summary?.kind === 'grpc' ? summary.recognized : undefined}
                  data-grpc-side={summary?.kind === 'grpc' ? summary.side : undefined}
                  data-rule-revision={summary?.kind === 'rules' || summary?.kind === 'rulesApplied'
                    ? summary.revision
                    : undefined}
                  data-rule-count={summary?.kind === 'rules' || summary?.kind === 'ruleHits'
                    ? summary.ruleCount
                    : undefined}
                  data-rule-enabled-count={summary?.kind === 'rules'
                    ? summary.enabledCount
                    : undefined}
                  data-rule-total-hits={summary?.kind === 'ruleHits'
                    ? summary.totalHits
                    : undefined}
                  data-breakpoint-count={summary?.kind === 'breakpoints'
                    ? summary.count
                    : undefined}
                  data-breakpoint-enabled={summary?.kind === 'breakpoints'
                    || summary?.kind === 'breakpointConfig'
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
                  data-diagnostics-count={summary?.kind === 'diagnostics' || summary?.kind === 'diagnosticsSnapshot' ? summary.count : undefined}
                  data-diagnostics-has-more={summary?.kind === 'diagnostics' ? summary.hasMore : undefined}
                  data-diagnostics-dropped-count={summary?.kind === 'diagnostics' ? summary.droppedCount : undefined}
                >
                  <b>{t('agent.tools.result')}</b>
                  {summary === null
                    ? t('agent.tools.running')
                    : <AgentToolResultSummary summary={summary} />}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
