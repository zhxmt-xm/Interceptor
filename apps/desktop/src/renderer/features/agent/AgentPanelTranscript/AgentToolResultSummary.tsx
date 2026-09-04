import { useTranslation } from 'react-i18next';

import { sizeLabel } from '../../../components/share/sizeLabel';
import type { AgentToolResultSummary as AgentToolResultSummaryValue } from '../utils';

interface AgentToolResultSummaryProps {
  readonly summary: AgentToolResultSummaryValue;
}

/** Renders one localized compact summary shared by query and change Tool results. */
export function AgentToolResultSummary({
  summary,
}: AgentToolResultSummaryProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  let content: string;
  switch (summary.kind) {
    case 'discovery':
      content = t('agent.tools.discovered', { count: summary.count });
      break;
    case 'proxy':
      content = `${t(summary.recording ? 'agent.tools.recordingOn' : 'agent.tools.recordingOff')} · ${summary.address}`;
      break;
    case 'storage':
      content = t('agent.tools.storage', {
        exchangeCount: new Intl.NumberFormat(i18n.language).format(summary.exchangeCount),
        bodyCount: new Intl.NumberFormat(i18n.language).format(summary.bodyCount),
        totalBytes: sizeLabel(summary.totalBytes, i18n.language),
      });
      break;
    case 'exchanges':
      content = t('agent.tools.exchanges', { count: summary.count });
      break;
    case 'exchange':
      content = `${summary.method} ${summary.path} · ${summary.status}`;
      break;
    case 'body':
      content = summary.opaque
        ? t('agent.tools.opaqueBody', { mimeType: summary.mimeType })
        : `${sizeLabel(summary.bytesRead, i18n.language)} · ${t(summary.end ? 'agent.tools.complete' : 'agent.tools.moreAvailable')}`;
      break;
    case 'websocket':
      content = `${t(summary.count === 1 ? 'agent.tools.oneMessage' : 'agent.tools.messages', { count: summary.count })} · ${t(summary.hasMore ? 'agent.tools.moreAvailable' : 'agent.tools.complete')}`;
      break;
    case 'grpc':
      content = `${summary.side} · ${t(summary.count === 1 ? 'agent.tools.oneMessage' : 'agent.tools.messages', { count: summary.count })} · ${t(summary.hasMore ? 'agent.tools.moreAvailable' : 'agent.tools.complete')}`;
      break;
    case 'not-grpc':
      content = t('agent.tools.notGrpc');
      break;
    case 'rules':
      content = t('agent.tools.rules', {
        revision: summary.revision,
        ruleCount: summary.ruleCount,
        enabledCount: summary.enabledCount,
      });
      break;
    case 'ruleHits':
      content = t('agent.tools.ruleHits', {
        ruleCount: summary.ruleCount,
        totalHits: summary.totalHits,
      });
      break;
    case 'rulesApplied':
      content = t('agent.tools.rulesApplied', { revision: summary.revision });
      break;
    case 'breakpoints':
      content = `${t('agent.tools.breakpoints', { count: summary.count })} · ${t(summary.enabled
        ? 'agent.tools.enabled'
        : 'agent.tools.disabled')}`;
      break;
    case 'breakpointConfig':
      content = t(summary.enabled ? 'agent.tools.enabled' : 'agent.tools.disabled');
      break;
    case 'breakpointResolution':
      content = `${t(summary.state === 'continued'
        ? 'agent.tools.continued'
        : summary.state === 'edited'
          ? 'agent.tools.edited'
          : 'agent.tools.dropped')} · ${summary.breakpointId}`;
      break;
    case 'error':
      content = summary.message;
      break;
    case 'value':
      content = summary.value;
      break;
  }
  return <span>{content}</span>;
}