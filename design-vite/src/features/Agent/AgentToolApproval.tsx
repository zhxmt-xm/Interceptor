import { Check, ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useDesignState } from '../../state/useDesignState';
import styles from './AgentToolApproval.module.css';

const TOOL_CONTENT = {
  capture_export_har: {
    description: 'Export captured HTTP exchanges as HAR 1.2 through the native Save Dialog.',
    effect: 'Save the selected Capture scope using the explicit redaction choices; starting the file job does not mean it has completed.\nScope: selected\nSelected exchanges: 2\nMask authorization: true\nMask cookies: true\nStrip bodies: false\nChoose the destination using the native Save Dialog.',
    arguments: 'scope: {"kind":"selected","exchangeIds":["exchange-one","exchange-two"]} · redaction: {"authorization":true,"cookies":true,"bodies":false}',
    result: 'Running · 0/2 · Warnings 0 · transfer-har-export',
  },
  capture_import_har: {
    description: 'Import a HAR file chosen through the native Open Dialog into a separate Capture session.',
    effect: 'Append the selected HAR to Capture without clearing existing exchanges; starting the file job does not mean it has completed.\nChoose a HAR file using the native Open Dialog.\nExisting Capture data is preserved.',
    result: 'Running · 0/2 · Warnings 0 · transfer-har-import',
  },
  capture_export_body: {
    description: 'Save a captured body in full through the native Save Dialog, without exposing body bytes or local file information.',
    effect: 'Choose a destination and save the original stored body bytes; starting a file job does not mean it has completed.\nExchange: exchange-one\nBody: body-one\nStored bytes: 2097152',
    arguments: 'exchangeId: exchange-one · bodyId: body-one',
    result: 'Running · 0/2097152 · Warnings 0 · transfer-body',
  },
  capture_cancel_transfer_job: {
    description: 'Cancel one running file transfer; completed, failed and cancelled jobs stay unchanged.',
    effect: 'Cancel only the selected running file transfer; existing saved files and other jobs are not removed.\nJob: transfer-archive\nKind: archive-export\nState: running\nProgress: 2/5',
    arguments: 'jobId: transfer-archive',
    result: 'Cancelled · 2/5 · Warnings 0 · transfer-archive',
  },
  diagnostics_export: {
    description: 'Start an atomic redacted JSONL export using the native Save Dialog and existing transfer service.',
    effect: 'Choose a destination and start exporting persisted diagnostic records; starting a job does not mean the export has completed.\nProcess: core\nMinimum level: info\nOutcome: success',
    arguments: 'process: core · level: info · outcome: success',
    result: 'Export job Running · transfer-diagnostics',
  },
  breakpoints_continue_queue: {
    description: 'Forward all currently pending items in one logical queue unchanged.',
    effect: 'Resolve only the target queue items present when the command starts; do not apply editor drafts.\nQueue: http\nCurrently pending: 2',
    arguments: 'queueKey: http',
    result: 'Continued · 2',
  },
  breakpoints_drop_queue: {
    description: 'Discard all currently pending items in one logical queue.',
    effect: 'Resolve only the target queue items present when the command starts; do not apply editor drafts.\nQueue: http\nCurrently pending: 2',
    arguments: 'queueKey: http',
    result: 'Dropped · 2',
  },
  breakpoints_continue_rule: {
    description: 'Forward all currently pending items from one Rule unchanged.',
    effect: 'Resolve the matching items present when the command starts; do not apply editor drafts.\nRule: rule-checkout\nCurrently pending: 2',
    arguments: 'ruleId: rule-checkout',
    result: 'Continued · 2',
  },
  composer_export_collection: {
    description: 'Export the saved Collection to a JSON file chosen through the native Save Dialog.',
    effect: 'Save the persisted Collection without sending requests or changing current edits.\nSaved requests: 2\nSaved folders: 1',
    result: 'Collection exported',
  },
  composer_import_collection: {
    description: 'Choose an exported Collection and confirm appending it through the product import preview.',
    effect: 'Append requests and folders with new identities after confirmation, without sending requests.\nChoose a JSON file using the native Open Dialog.\nReview the import preview, then confirm to append and save the Collection.',
    result: 'Imported requests 2 · Folders 1 · Revision 2',
  },
  composer_replace_collection: {
    description: 'Replace the saved Composer Collection with revision checking.',
    effect: 'Replace the complete Collection without sending requests; preserve unchanged masked credentials.\nRequest count: 2 -> 0\nFolder count: 1 -> 0',
    arguments: 'baseRevision: 3 · nodes: []',
    result: 'Collection revision 4 applied',
  },
  rules_import: {
    description: 'Choose an exported Rule file and confirm appending it through the product import preview.',
    effect: 'Append Rules with new identities and persist them with the current Rule draft after confirmation.\nChoose a JSON file using the native Open Dialog.\nReview the import preview, then confirm to append Rules and persist the current draft.',
    result: 'Imported rules 2 · Folders 1 · Revision 2',
  },
  rules_export: {
    description: 'Export the saved Rule tree to a JSON file chosen through the native Save Dialog.',
    effect: 'Save the persisted Rules to a JSON file without changing the Rule tree or unsaved drafts.\nSaved Rules: 2\nSaved folders: 1',
    result: 'Rules exported',
  },
  settings_replace_tls_insecure_hosts: {
    description: 'Replace hosts that skip upstream TLS certificate verification.',
    effect: 'Replace hosts that skip upstream TLS certificate verification.\nInsecure host count: 0 -> 1',
    arguments: 'hosts: ["localhost"]',
    result: 'Hosts 1',
  },
  settings_replace_tls_passthrough: {
    description: 'Replace TLS passthrough patterns at the current revision.',
    effect: 'Replace TLS passthrough patterns at the current revision.\nRevision: 0; current: 0\nPassthrough host count: 0 -> 1',
    arguments: 'hosts: ["*.example.test"] · expectedRevision: 0',
    result: 'Revision 1 · Hosts 1',
  },
  settings_enable_https_decryption: {
    description: 'Enable HTTPS decryption when the existing Root CA is trusted.',
    effect: 'Enable HTTPS decryption when the existing Root CA is trusted.\nRoot CA trusted: true\nDecryption intent: false',
    result: 'HTTPS Enabled · Intent Enabled · CA Trusted',
  },
  settings_disable_https_decryption: {
    description: 'Disable HTTPS decryption without changing certificate trust.',
    effect: 'Disable HTTPS decryption without changing certificate trust.\nRoot CA trusted: true\nDecryption intent: true',
    result: 'HTTPS Disabled · Intent Disabled · CA Trusted',
  },
  settings_enable_system_proxy: {
    description: 'Route system traffic through Interceptor using the active proxy listener.',
    effect: 'Route system traffic through Interceptor using the active proxy listener.\nSystem proxy supported: true\nSystem proxy enabled: false\nOwned by Interceptor: false',
    result: 'Owned by Interceptor',
  },
  settings_restore_system_proxy: {
    description: 'Restore the system proxy configuration saved before Interceptor took ownership.',
    effect: 'Restore the system proxy configuration saved before Interceptor took ownership.\nSystem proxy supported: true\nSystem proxy enabled: true\nOwned by Interceptor: true',
    result: 'System proxy restored',
  },
  capture_start_recording: {
    description: 'Resume capture in the current session.',
    effect: 'Recording resumes on 127.0.0.1:8888.',
    result: 'Recording on · 127.0.0.1:8888',
  },
  capture_stop_recording: {
    description: 'Pause capture without stopping the proxy.',
    effect: 'New traffic will continue through the proxy but will not be captured.',
    result: 'Recording off · 127.0.0.1:8888',
  },
  capture_clear: {
    description: 'Delete captured exchanges and bodies.',
    effect: 'Scope: all · Permanently deletes 13 exchanges and 1 body.',
    result: 'Exchanges 0 · Bodies 0 · 4 KB',
  },
  rules_replace_tree: {
    description: 'Replace the rule set with revision checking.',
    effect: 'Rule count: 1 → 1 · Enabled: 1 → 1',
    result: 'Revision 2 applied',
  },
  composer_send_request: {
    description: 'Send a Composer request from this machine.',
    effect: 'POST http://127.0.0.1:43127/e2e/agent/requests/allowed',
    result: 'POST /e2e/agent/requests/allowed · 201 · 32 B',
  },
} as const;

export function AgentToolApproval(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const tool = TOOL_CONTENT[state.agentToolApprovalName];
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.agentToolApproval === 'allowed' || state.agentToolApproval === 'denied') {
      resultRef.current?.focus();
    }
  }, [state.agentToolApproval]);
  if (!state.agentToolApproval) return null;

  if (state.agentToolApproval === 'allowed' || state.agentToolApproval === 'denied') {
    const allowed = state.agentToolApproval === 'allowed';
    const exportCanceled = (state.agentToolApprovalName === 'rules_export' && !state.agentRulesExported)
      || (state.agentToolApprovalName === 'composer_export_collection' && !state.agentCollectionExported)
      || (state.agentToolApprovalName === 'capture_export_body' && !state.agentBodyExportStarted)
      || (state.agentToolApprovalName === 'capture_export_har' && !state.agentHarExportStarted)
      || (state.agentToolApprovalName === 'diagnostics_export' && !state.agentDiagnosticsExportStarted);
    const importCanceled = (state.agentToolApprovalName === 'rules_import' && !state.agentRulesImported)
      || (state.agentToolApprovalName === 'capture_import_har' && !state.agentHarImportStarted)
      || (state.agentToolApprovalName === 'composer_import_collection' && !state.agentCollectionImported);
    return (
      <div
        aria-live="polite"
        className={styles.toolApprovalResult}
        data-approval-status={state.agentToolApproval}
        data-parity="agent-tool-approval"
        ref={resultRef}
        role="status"
        tabIndex={-1}
      >
        {allowed ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
        <strong>{allowed ? 'Allowed' : 'Denied'}</strong>
        <span className={styles.toolApprovalResultCopy}>
          <code>{state.agentToolApprovalName}</code>
          {allowed ? <span>{exportCanceled ? 'Export canceled' : importCanceled ? 'Import canceled' : tool.result}</span> : null}
        </span>
      </div>
    );
  }

  return (
    <section
      className={styles.toolApproval}
      data-approval-status="pending"
      data-parity="agent-tool-approval"
    >
      <header className={styles.toolApprovalHeader}>
        <span className={styles.toolApprovalIcon}><ShieldAlert aria-hidden="true" /></span>
        <div>
          <strong>Allow this Tool?</strong>
          <code>{state.agentToolApprovalName}</code>
        </div>
        <span className={styles.toolApprovalKind}>change</span>
      </header>
      <div className={styles.toolApprovalBody}>
        <p>{tool.description}</p>
        <dl>
          <div><dt>{state.agentToolApprovalName.startsWith('settings_') || state.agentToolApprovalName.startsWith('breakpoints_') || state.agentToolApprovalName.startsWith('diagnostics_') || ['capture_export_har', 'capture_import_har', 'capture_export_body', 'capture_cancel_transfer_job', 'rules_export', 'rules_import', 'composer_replace_collection', 'composer_export_collection', 'composer_import_collection'].includes(state.agentToolApprovalName) ? 'Arguments' : 'Parameters'}</dt><dd>{'arguments' in tool ? tool.arguments : 'No parameters'}</dd></div>
          <div><dt>Effect</dt><dd>{tool.effect}</dd></div>
        </dl>
      </div>
      <footer className={styles.toolApprovalActions}>
        <button type="button" onClick={() => updateState({ agentToolApproval: 'denied' })}>Deny Tool</button>
        <button className={styles.toolApprovalAllow} type="button" onClick={() => updateState({ agentToolApproval: 'allowed' })}>Allow Tool</button>
      </footer>
    </section>
  );
}