import { RefreshCw, Search } from 'lucide-react';

import { buildInterceptorToolSettingsGroups } from '@interceptor/tools';
import { useDesignState } from '../../state/useDesignState';
import { PLAYGROUND_TRAFFIC_GROUPS } from './playgroundData';
import styles from './PlaygroundCatalog.module.css';

const PLAYGROUND_TOOL_GROUPS = buildInterceptorToolSettingsGroups();

export function PlaygroundCatalog(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  return (
    <aside className={styles.playgroundCatalog}>
      <div className={styles.playgroundCatalogTitle}><strong>{state.playgroundSection === 'mcp' ? 'Tools' : 'Scenarios'}</strong><span>{state.playgroundSection === 'mcp' ? 'Live catalog' : 'Capture matrix'}</span></div>
      <div className={styles.playgroundCatalogToolbar}><label className={styles.playgroundSearch}><Search aria-hidden="true" /><input aria-label="Search catalog" placeholder="Search" /></label>{state.playgroundSection === 'mcp' ? <button aria-label="Refresh tools" type="button"><RefreshCw aria-hidden="true" /></button> : null}</div>
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
        )) : PLAYGROUND_TRAFFIC_GROUPS.map((group) => (
          <section className={styles.playgroundGroup} key={group.id}>
            <header><span>{group.title}</span><code>{group.scenarios.length}</code></header>
            {group.scenarios.map((scenario) => (
              <button
                className={state.playgroundSelectedScenario === scenario.id ? styles.selected : ''}
                data-playground-scenario={scenario.id}
                key={scenario.id}
                type="button"
                onClick={() => updateState({
                  playgroundSelectedScenario: scenario.id,
                  playgroundRequestDraft: JSON.stringify(scenario.draft, null, 2),
                  playgroundManualStatus: 'not-run',
                })}
              ><span><strong>{scenario.title}</strong></span><small>{scenario.detail}</small></button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}