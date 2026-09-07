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
    case 'uiLanguage':
      content = `${t('common.language')}: ${summary.language}`;
      break;
    case 'uiTheme':
      content = `${t('common.theme')}: ${t(`theme.${summary.theme}`)}`;
      break;
    case 'exportPrivacyDefaults':
      content = [
        `${t('settings.maskAuthorization')}: ${t(summary.maskAuthorization ? 'agent.tools.enabled' : 'agent.tools.disabled')}`,
        `${t('settings.maskCookies')}: ${t(summary.maskCookies ? 'agent.tools.enabled' : 'agent.tools.disabled')}`,
        `${t('settings.warnUnmasked')}: ${t(summary.warnBeforeUnmasked ? 'agent.tools.enabled' : 'agent.tools.disabled')}`,
      ].join(' · ');
      break;
    case 'coreProcess':
      content = t('agent.tools.coreProcess', { state: summary.state, pid: summary.pid ?? '-' });
      break;
    case 'systemProxy':
      content = t(!summary.supported ? 'agent.tools.unsupported'
        : summary.owned ? 'settings.ownedByInterceptor'
          : summary.enabled ? 'agent.tools.enabled' : 'agent.tools.disabled');
      break;
    case 'certificateStatus':
      content = `${t(!summary.present ? 'settings.notGenerated' : summary.trusted ? 'settings.trusted' : 'settings.notInstalled')} · HTTPS ${t(summary.mitmEnabled ? 'agent.tools.enabled' : 'agent.tools.disabled')}`;
      break;
    case 'systemProxyRestore':
      content = t(summary.restored ? 'agent.tools.proxyRestored' : 'agent.tools.proxyRestoreSkipped', {
        reason: summary.reason ?? '-',
      });
      break;
    case 'tlsHosts':
      content = t('agent.tools.tlsHosts', { count: summary.count });
      break;
    case 'decryption':
      content = t('agent.tools.decryption', {
        effective: t(summary.decrypting ? 'agent.tools.enabled' : 'agent.tools.disabled'),
        intent: t(summary.mitmEnabled ? 'agent.tools.enabled' : 'agent.tools.disabled'),
        trust: t(summary.trusted ? 'settings.trusted' : 'settings.notInstalled'),
      });
      break;
    case 'tlsPassthrough':
      content = t('agent.tools.tlsPassthrough', { count: summary.count, revision: summary.revision });
      break;
    case 'appContainers':
      content = summary.supported
        ? t('agent.tools.appContainers', { count: summary.count, exemptCount: summary.exemptCount })
        : t('agent.tools.unsupported');
      break;
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
    case 'collection':
      content = t('agent.tools.collection', {
        revision: summary.revision, requestCount: summary.requestCount, folderCount: summary.folderCount,
      });
      break;
    case 'collectionReplaced':
      content = t('agent.tools.collectionReplaced', { revision: summary.revision });
      break;
    case 'collectionExport':
      content = t(summary.exported ? 'agent.tools.collectionExported' : 'agent.tools.exportCanceled');
      break;
    case 'collectionImported':
      content = t('agent.tools.collectionImported', {
        revision: summary.revision, requestCount: summary.requestCount, folderCount: summary.folderCount,
      });
      break;
    case 'rulesExport':
      content = t(summary.exported ? 'agent.tools.rulesExported' : 'agent.tools.exportCanceled');
      break;
    case 'rulesImported':
      content = t('agent.tools.rulesImported', {
        revision: summary.revision, ruleCount: summary.ruleCount, folderCount: summary.folderCount,
      });
      break;
    case 'importCanceled':
      content = t('agent.tools.importCanceled');
      break;
    case 'breakpoints':
      content = `${t('agent.tools.breakpoints', { count: summary.count })} · ${t(summary.enabled
        ? 'agent.tools.enabled'
        : 'agent.tools.disabled')}`;
      break;
    case 'breakpointConfig':
      content = t(summary.enabled ? 'agent.tools.enabled' : 'agent.tools.disabled');
      break;
    case 'breakpointBatch':
      content = `${t(summary.state === 'continued' ? 'agent.tools.continued' : 'agent.tools.dropped')} · ${new Intl.NumberFormat(i18n.language).format(summary.count)}`;
      break;
    case 'breakpointResolution':
      content = `${t(summary.state === 'continued'
        ? 'agent.tools.continued'
        : summary.state === 'edited'
          ? 'agent.tools.edited'
          : 'agent.tools.dropped')} · ${summary.breakpointId}`;
      break;
    case 'request':
      content = summary.ok
        ? `${summary.method} ${summary.path} · ${summary.status} · ${sizeLabel(summary.totalBytes, i18n.language)}`
        : `${t('agent.tools.requestFailed')} · ${summary.method} ${summary.path}`;
      break;
    case 'probe':
      content = summary.ok
        ? `${summary.protocol} · ${summary.alpn || '-'} · ${t('agent.tools.certificates', { count: summary.certificateCount })}`
        : `${t('agent.tools.probeFailed')} · ${summary.error}`;
      break;
    case 'diagnostics':
      content = t('agent.tools.diagnostics', {
        count: summary.count,
        state: t(summary.hasMore ? 'agent.tools.moreAvailable' : 'agent.tools.complete'),
        droppedCount: summary.droppedCount,
      });
      break;
    case 'diagnosticsSnapshot':
      content = t('agent.tools.diagnosticsSnapshot', { count: summary.count, droppedCount: summary.droppedCount });
      break;
    case 'transferJobMissing':
      content = t('agent.tools.transferJobMissing');
      break;
    case 'transferJob':
      content = t('agent.tools.transferJob', {
        jobId: summary.jobId,
        processed: summary.processed,
        total: summary.total,
        warningCount: summary.warningCount,
        state: t(summary.state === 'running' ? 'agent.tools.running'
          : summary.state === 'completed' ? 'agent.tools.complete'
            : summary.state === 'failed' ? 'agent.tools.failed' : 'diagnostics.cancelled'),
      });
      break;
    case 'diagnosticsExport':
      content = t('agent.tools.exportJob', {
        jobId: summary.jobId,
        state: t(summary.state === 'running' ? 'agent.tools.running'
          : summary.state === 'completed' ? 'agent.tools.complete'
            : summary.state === 'failed' ? 'agent.tools.failed' : 'diagnostics.cancelled'),
      });
      break;
    case 'exportCanceled':
      content = t('agent.tools.exportCanceled');
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