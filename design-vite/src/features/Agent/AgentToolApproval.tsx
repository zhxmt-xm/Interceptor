import { Check, ShieldAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useDesignState } from '../../state/useDesignState';
import styles from './AgentToolApproval.module.css';

const TOOL_CONTENT = {
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
          {allowed ? <span>{tool.result}</span> : null}
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
          <div><dt>{state.agentToolApprovalName.startsWith('settings_') ? 'Arguments' : 'Parameters'}</dt><dd>No parameters</dd></div>
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