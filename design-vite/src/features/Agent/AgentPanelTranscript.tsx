import { Bot, RefreshCw } from 'lucide-react';

import { useDesignState } from '../../state/useDesignState';
import { AgentToolApproval } from './AgentToolApproval';
import { AgentQueryToolTrace } from './AgentQueryToolTrace';
import styles from './AgentPanelTranscript.module.css';

export function AgentPanelTranscript(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  if (state.agentChat === 'new') {
    return <div aria-label="Empty chat" className={styles.agentTranscriptScroll} data-parity="agent-transcript" />;
  }
  const sent = state.agentChat === 'sent';
  const toolTrace = state.agentToolTrace;
  return (
    <div className={styles.agentTranscriptScroll} data-parity="agent-transcript">
      <div className={styles.agentTranscript}>
        <div className={styles.agentUserMessage}>
          {toolTrace === 'traffic'
            ? 'Inspect Capture storage and the latest captured request, then summarize their status.'
            : toolTrace === 'body-messages'
              ? 'Read the JSON response body, WebSocket messages, and gRPC response messages.'
            : sent ? state.agentMessage : 'Help me diagnose repeated 401 responses after token refresh.'}
        </div>
        <article className={styles.agentAssistantMessage}>
          <span className={styles.agentAssistantAvatar}><Bot aria-hidden="true" /></span>
          <div className={styles.agentAssistantResponse}>
            {toolTrace !== '' ? (
              <>
                <AgentQueryToolTrace variant={toolTrace} />
                {toolTrace === 'traffic'
                  ? <p>Capture storage is non-empty. The latest exchange is <code>GET /agent-e2e/traffic</code> with status <code>200</code>.</p>
                  : <p>The JSON body is ready. WebSocket has <code>2</code> messages, and the gRPC response contains <code>1</code> message.</p>}
              </>
            ) : state.agentTurnState === 'failed' ? (
              <div className={styles.agentTurnNotice} data-tone="error">
                <strong>Model request failed</strong>
                <span>The provider did not complete this response.</span>
                <button type="button" onClick={() => updateState({ agentTurnState: 'running' })}>
                  <RefreshCw aria-hidden="true" />Retry response
                </button>
              </div>
            ) : sent ? (
              <p>Treat <code>invalid_grant</code> as a credential failure. Ask the user to authenticate again instead of retrying the same refresh token.</p>
            ) : (
              <>
                <p>A repeated <code>401</code> after refresh usually means the client kept using an expired access token or the refresh grant was rejected.</p>
                <ul>
                  <li>Confirm the refreshed token replaces the old token atomically.</li>
                  <li>Check whether the token endpoint returns <code>invalid_grant</code>.</li>
                  <li>Compare the token audience and clock skew with the API.</li>
                </ul>
              </>
            )}
            {state.agentTurnState === 'running' && <span className={styles.agentTurnProgress}>Generating response…</span>}
            <AgentToolApproval />
            {state.agentTurnState === 'stopped' && (
              <div className={styles.agentTurnNotice}>
                <strong>Response stopped</strong>
                <span>Visible output is preserved.</span>
                <button type="button" onClick={() => updateState({ agentTurnState: 'running' })}>
                  <RefreshCw aria-hidden="true" />Retry response
                </button>
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}