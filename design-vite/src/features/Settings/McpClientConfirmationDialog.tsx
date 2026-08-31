import { AlertTriangle } from 'lucide-react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './McpClientConfirmationDialog.module.css';

export function McpClientConfirmationDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const action = state.mcpClientDialog;
  if (action !== 'regenerate' && action !== 'revoke') return null;
  const regenerate = action === 'regenerate';
  const close = (): void => updateState({ mcpClientDialog: '' });

  return (
    <div className={styles.mcpClientConfirmationOverlay}>
      <section
        aria-labelledby="mcp-client-confirmation-title"
        aria-modal="true"
        className={styles.mcpClientConfirmationDialog}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
      >
        <span className={styles.mcpClientConfirmationIcon}><AlertTriangle aria-hidden="true" /></span>
        <div>
          <h2 id="mcp-client-confirmation-title">
            {regenerate ? 'Regenerate MCP credential' : 'Revoke MCP client'}
          </h2>
          <p>{regenerate
            ? 'The current configuration will stop working immediately. App restarts never rotate this credential automatically.'
            : `${state.mcpClientLabel} will lose access and all of its active sessions will close.`}</p>
        </div>
        <footer>
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
          <button
            className={fixtureClassNames(`btn ${regenerate ? 'pri' : 'danger'}`)}
            type="button"
            onClick={() => {
              if (regenerate) {
                updateState({
                  mcpClientDialog: '',
                  mcpConfigCopied: false,
                  mcpCredentialGeneration: state.mcpCredentialGeneration + 1,
                });
              } else {
                updateState({
                  mcpClientDialog: '',
                  mcpClientLabel: '',
                  mcpConfigCopied: false,
                  mcpCredentialGeneration: 0,
                });
              }
            }}
          >{regenerate ? 'Regenerate credential' : 'Revoke client'}</button>
        </footer>
      </section>
    </div>
  );
}