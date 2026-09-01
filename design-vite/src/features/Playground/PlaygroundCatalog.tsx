import { Activity, Braces, Search } from 'lucide-react';

import { buildInterceptorToolSettingsGroups } from '@interceptor/tools';
import { useDesignState } from '../../state/useDesignState';
import { PLAYGROUND_TRAFFIC_SCENARIOS } from './playgroundData';
import styles from './PlaygroundCatalog.module.css';

const PLAYGROUND_TOOL_GROUPS = buildInterceptorToolSettingsGroups();

export function PlaygroundCatalog(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  return (
    <aside className={styles.playgroundCatalog}>
      <div className={styles.playgroundCatalogTabs}>
        <button className={state.playgroundSection === 'mcp' ? styles.active : ''} type="button" onClick={() => updateState({ playgroundSection: 'mcp' })}><Braces aria-hidden="true" />MCP Tools</button>
        <button className={state.playgroundSection === 'traffic' ? styles.active : ''} type="button" onClick={() => updateState({ playgroundSection: 'traffic' })}><Activity aria-hidden="true" />Traffic Lab</button>
      </div>
      <label className={styles.playgroundSearch}><Search aria-hidden="true" /><input aria-label="Search catalog" placeholder="Search" /></label>
      <div className={styles.playgroundCatalogScroll}>
        {state.playgroundSection === 'mcp' ? PLAYGROUND_TOOL_GROUPS.map((group) => (
          <section className={styles.playgroundGroup} key={group.id}>
            <header><span>{group.title}</span><code>{group.tools.length}</code></header>
            {group.tools.map((tool) => (
              <button
                className={state.playgroundSelectedTool === tool.name ? styles.selected : ''}
                data-playground-tool={tool.name}
                key={tool.name}
                type="button"
                onClick={() => updateState({ playgroundSelectedTool: tool.name, playgroundCallState: tool.kind === 'query' ? 'complete' : 'approval', playgroundManualStatus: 'not-run' })}
              >
                <span><strong>{tool.title}</strong><em data-kind={tool.kind}>{tool.kind}</em></span>
                <code>{tool.name}</code>
              </button>
            ))}
          </section>
        )) : (
          <section className={styles.playgroundGroup}>
            <header><span>HTTP/1.1</span><code>4</code></header>
            {PLAYGROUND_TRAFFIC_SCENARIOS.map((scenario) => (
              <button
                className={state.playgroundSelectedScenario === scenario.id ? styles.selected : ''}
                data-playground-scenario={scenario.id}
                key={scenario.id}
                type="button"
                onClick={() => updateState({ playgroundSelectedScenario: scenario.id, playgroundManualStatus: 'not-run' })}
              ><span><strong>{scenario.title}</strong></span><small>{scenario.detail}</small></button>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}