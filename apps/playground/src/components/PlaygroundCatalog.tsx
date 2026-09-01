import { Activity, Braces, RefreshCw, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import type { PlaygroundSection } from '../interfaces';
import type { PlaygroundMcpTool } from '../mcp/session';
import type { TrafficScenarioDescriptor, TrafficScenarioId } from '../../server/interfaces.ts';
import styles from './PlaygroundCatalog.module.css';

interface PlaygroundCatalogProps {
  readonly section: PlaygroundSection;
  readonly selectedScenarioId: TrafficScenarioId;
  readonly selectedToolName: string;
  readonly trafficScenarios: readonly TrafficScenarioDescriptor[];
  readonly tools: readonly PlaygroundMcpTool[];
  readonly onRefreshTools: () => void;
  readonly onSectionChange: (section: PlaygroundSection) => void;
  readonly onSelectScenario: (scenarioId: TrafficScenarioId) => void;
  readonly onSelectTool: (name: string) => void;
}

export function PlaygroundCatalog({ section, selectedScenarioId, selectedToolName, trafficScenarios, tools, onRefreshTools, onSectionChange, onSelectScenario, onSelectTool }: PlaygroundCatalogProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const visibleTools = tools.filter((tool) => deferredSearch.length === 0 || tool.name.includes(deferredSearch) || tool.title?.toLowerCase().includes(deferredSearch) || tool.description?.toLowerCase().includes(deferredSearch));
  const queryTools = visibleTools.filter((tool) => tool.annotations?.readOnlyHint === true);
  const changeTools = visibleTools.filter((tool) => tool.annotations?.readOnlyHint !== true);
  return (
    <aside className={styles.playgroundCatalog}>
      <div className={styles.playgroundCatalogTabs}><button className={section === 'mcp' ? styles.active : ''} type="button" onClick={() => onSectionChange('mcp')}><Braces aria-hidden="true" />MCP Tools</button><button className={section === 'traffic' ? styles.active : ''} type="button" onClick={() => onSectionChange('traffic')}><Activity aria-hidden="true" />Traffic Lab</button></div>
      <div className={styles.playgroundCatalogToolbar}><label><Search aria-hidden="true" /><input aria-label="Search catalog" placeholder="Search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button aria-label="Refresh tools" disabled={section !== 'mcp'} type="button" onClick={onRefreshTools}><RefreshCw aria-hidden="true" /></button></div>
      <div className={styles.playgroundCatalogScroll}>
        {section === 'mcp' ? <>{renderGroup('Queries', queryTools)}{renderGroup('Changes', changeTools)}</> : (
          <section className={styles.playgroundGroup}>
            <header><span>HTTP/1.1</span><code>{trafficScenarios.length}</code></header>
            {trafficScenarios.map((scenario) => (
              <button className={selectedScenarioId === scenario.id ? styles.selected : ''} key={scenario.id} type="button" onClick={() => onSelectScenario(scenario.id)}>
                <span><strong>{scenario.title}</strong></span>
                <small>{scenario.description}</small>
              </button>
            ))}
          </section>
        )}
      </div>
    </aside>
  );

  function renderGroup(title: string, items: readonly PlaygroundMcpTool[]): React.JSX.Element | null {
    if (items.length === 0) return null;
    return <section className={styles.playgroundGroup}><header><span>{title}</span><code>{items.length}</code></header>{items.map((tool) => <button className={selectedToolName === tool.name ? styles.selected : ''} key={tool.name} type="button" onClick={() => onSelectTool(tool.name)}><span><strong>{tool.title ?? tool.name}</strong><em data-kind={tool.annotations?.readOnlyHint ? 'query' : 'change'}>{tool.annotations?.readOnlyHint ? 'query' : 'change'}</em></span><code>{tool.name}</code></button>)}</section>;
  }
}