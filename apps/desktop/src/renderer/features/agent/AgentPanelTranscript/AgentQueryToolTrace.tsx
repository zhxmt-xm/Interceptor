import { CheckCircle2, CircleAlert, LoaderCircle, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import { sizeLabel } from '../../../components/share/sizeLabel';
import type {
  AgentToolCallTranscriptItem,
  AgentToolResultTranscriptItem,
} from '../../../../shared/desktop-api';
import {
  formatAgentToolArguments,
  summarizeAgentToolResult,
} from '../utils';
import styles from './AgentQueryToolTrace.module.css';

interface AgentQueryToolTraceProps {
  readonly calls: readonly AgentToolCallTranscriptItem[];
  readonly results: readonly AgentToolResultTranscriptItem[];
}

/** Renders completed and running query Tool calls as one ordered activity log. */
export function AgentQueryToolTrace({ calls, results }: AgentQueryToolTraceProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
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
                >
                  <b>{t('agent.tools.result')}</b>
                  {summary === null
                    ? t('agent.tools.running')
                    : formatResultSummary(summary, t, i18n.language)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Formats one typed Tool summary into localized display text. */
function formatResultSummary(
  summary: ReturnType<typeof summarizeAgentToolResult>,
  t: ReturnType<typeof useTranslation>['t'],
  locale: string,
): string {
  switch (summary.kind) {
    case 'discovery':
      return t('agent.tools.discovered', { count: summary.count });
    case 'proxy':
      return `${t(summary.recording ? 'agent.tools.recordingOn' : 'agent.tools.recordingOff')} · ${summary.address}`;
    case 'storage':
      return t('agent.tools.storage', {
        exchangeCount: new Intl.NumberFormat(locale).format(summary.exchangeCount),
        bodyCount: new Intl.NumberFormat(locale).format(summary.bodyCount),
        totalBytes: sizeLabel(summary.totalBytes, locale),
      });
    case 'exchanges':
      return t('agent.tools.exchanges', { count: summary.count });
    case 'exchange':
      return `${summary.method} ${summary.path} · ${summary.status}`;
    case 'body':
      return summary.opaque
        ? t('agent.tools.opaqueBody', { mimeType: summary.mimeType })
        : `${sizeLabel(summary.bytesRead, locale)} · ${t(summary.end ? 'agent.tools.complete' : 'agent.tools.moreAvailable')}`;
    case 'websocket':
      return `${t(summary.count === 1 ? 'agent.tools.oneMessage' : 'agent.tools.messages', { count: summary.count })} · ${t(summary.hasMore ? 'agent.tools.moreAvailable' : 'agent.tools.complete')}`;
    case 'grpc':
      return `${summary.side} · ${t(summary.count === 1 ? 'agent.tools.oneMessage' : 'agent.tools.messages', { count: summary.count })} · ${t(summary.hasMore ? 'agent.tools.moreAvailable' : 'agent.tools.complete')}`;
    case 'not-grpc':
      return t('agent.tools.notGrpc');
    case 'error':
      return summary.message;
    case 'value':
      return summary.value;
  }
}
