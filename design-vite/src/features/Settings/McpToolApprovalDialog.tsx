import { ShieldAlert } from 'lucide-react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './McpToolApprovalDialog.module.css';

export function McpToolApprovalDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (state.mcpToolApproval !== 'pending') return null;

  return (
    <div className={styles.mcpToolApprovalOverlay}>
      <section
        aria-labelledby="mcp-tool-approval-title"
        aria-modal="true"
        className={styles.mcpToolApprovalDialog}
        role="dialog"
      >
        <header className={styles.mcpToolApprovalHeader}>
          <span><ShieldAlert aria-hidden="true" /></span>
          <div>
            <h2 id="mcp-tool-approval-title">Approve MCP Tool call</h2>
            <p><strong>VS Code</strong> is requesting a change to Interceptor.</p>
          </div>
        </header>
        <dl className={styles.mcpToolApprovalDetails}>
          <div><dt>Tool</dt><dd><code>stop_recording</code></dd></div>
          <div><dt>Arguments</dt><dd><code>{'{}'}</code></dd></div>
          <div><dt>Effect</dt><dd>New traffic will continue through the proxy but will not be captured.</dd></div>
        </dl>
        <footer>
          <button
            className={fixtureClassNames('btn')}
            type="button"
            onClick={() => updateState({ mcpToolApproval: '' })}
          >Deny Tool call</button>
          <button
            className={fixtureClassNames('btn pri')}
            type="button"
            onClick={() => updateState({ mcpToolApproval: '' })}
          >Allow Tool call</button>
        </footer>
      </section>
    </div>
  );
}