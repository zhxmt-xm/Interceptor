import { Check, CircleSlash2, X } from 'lucide-react';

import { useDesignState } from '../../state/useDesignState';
import { playgroundTool } from './playgroundData';
import styles from './PlaygroundInspector.module.css';

export function PlaygroundInspector(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const tool = playgroundTool(state.playgroundSelectedTool);
  const isMcp = state.playgroundSection === 'mcp';
  const waiting = isMcp && state.playgroundCallState === 'approval';
  const requestBody = state.playgroundSection === 'mcp'
    ? JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: tool.name, arguments: {} } }, null, 2)
    : 'GET /playground/orders/42 HTTP/1.1\nHost: 127.0.0.1:45190';
  return (
    <aside className={styles.playgroundInspector}>
      <header><div><strong>Operation details</strong><span>{isMcp ? 'MCP exchange #7' : 'Traffic run #12'}</span></div><code>{waiting ? 'OPEN' : '200'}</code></header>
      <div className={styles.playgroundInspectorScroll}>
        <section><h2>Request</h2><dl><div><dt>Method</dt><dd>{isMcp ? 'POST' : 'GET'}</dd></div><div><dt>Duration</dt><dd>{waiting ? '12.4 s' : isMcp ? '42 ms' : '38 ms'}</dd></div>{isMcp ? <div><dt>Authorization</dt><dd>Bearer &lt;redacted · 7c91&gt;</dd></div> : <div><dt>Proxy</dt><dd>127.0.0.1:8888</dd></div>}</dl><pre>{requestBody}</pre></section>
        <section><h2>Response</h2><pre>{waiting ? 'Waiting for Developer decision in Interceptor…' : isMcp ? '{\n  "resultType": "complete",\n  "content": [{ "type": "text", "text": "recording: true" }]\n}' : '200 OK\ncontent-type: application/json\ncontent-length: 184'}</pre></section>
        <section><h2>Manual result</h2><div className={styles.playgroundManualStatus}>
          <button className={state.playgroundManualStatus === 'pass' ? styles.activePass : ''} type="button" onClick={() => updateState({ playgroundManualStatus: 'pass' })}><Check aria-hidden="true" />Pass</button>
          <button className={state.playgroundManualStatus === 'fail' ? styles.activeFail : ''} type="button" onClick={() => updateState({ playgroundManualStatus: 'fail' })}><X aria-hidden="true" />Fail</button>
          <button className={state.playgroundManualStatus === 'blocked' ? styles.activeBlocked : ''} type="button" onClick={() => updateState({ playgroundManualStatus: 'blocked' })}><CircleSlash2 aria-hidden="true" />Blocked</button>
        </div><textarea aria-label="Manual notes" placeholder="What did you observe in Interceptor and at the origin?" /></section>
      </div>
    </aside>
  );
}