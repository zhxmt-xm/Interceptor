import { Input, type InputRef } from 'antd';
import { PlugZap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './McpClientDialog.module.css';

export function McpClientDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  const [label, setLabel] = useState('VS Code');
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (state.mcpClientDialog !== 'add') return;
    setLabel('VS Code');
    queueMicrotask(() => inputRef.current?.focus());
  }, [state.mcpClientDialog]);

  if (state.mcpClientDialog !== 'add') return null;
  const close = (): void => updateState({ mcpClientDialog: '' });

  return (
    <div className={styles.mcpClientDialogOverlay}>
      <section
        aria-labelledby="mcp-client-dialog-title"
        aria-modal="true"
        className={styles.mcpClientDialog}
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
      >
        <header className={styles.mcpClientDialogHeader}>
          <span><PlugZap aria-hidden="true" /></span>
          <div>
            <h2 id="mcp-client-dialog-title">Add MCP client</h2>
            <p>Create an independent credential for one trusted local AI host.</p>
          </div>
        </header>
        <div className={styles.mcpClientDialogFields}>
          <label>
            <span>Client name</span>
            <Input
              aria-label="Client name"
              ref={inputRef}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
        </div>
        <footer>
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
          <button
            className={fixtureClassNames('btn pri')}
            disabled={label.trim().length === 0}
            type="button"
            onClick={() => updateState({
              mcpClientDialog: '',
              mcpClientExecutionMode: 'ask',
              mcpClientLabel: label.trim(),
              mcpConfigCopied: false,
              mcpCredentialGeneration: 0,
            })}
          >Create client</button>
        </footer>
      </section>
    </div>
  );
}