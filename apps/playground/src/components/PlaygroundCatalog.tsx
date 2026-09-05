import { RefreshCw, Search } from 'lucide-react';
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
  readonly onSelectScenario: (scenarioId: TrafficScenarioId) => void;
  readonly onSelectTool: (name: string) => void;
}

export function PlaygroundCatalog({ section, selectedScenarioId, selectedToolName, trafficScenarios, tools, onRefreshTools, onSelectScenario, onSelectTool }: PlaygroundCatalogProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const visibleTools = tools.filter((tool) => deferredSearch.length === 0 || tool.name.includes(deferredSearch) || tool.title?.toLowerCase().includes(deferredSearch) || tool.description?.toLowerCase().includes(deferredSearch));
  const queryTools = visibleTools.filter((tool) => tool.annotations?.readOnlyHint === true);
  const changeTools = visibleTools.filter((tool) => tool.annotations?.readOnlyHint !== true);
  const visibleScenarios = trafficScenarios.filter((scenario) => deferredSearch.length === 0 || scenario.title.toLowerCase().includes(deferredSearch) || scenario.description.toLowerCase().includes(deferredSearch));
  const scenarioGroups = [...new Set(trafficScenarios.map((scenario) => scenario.group))];
  return (
    <aside className={styles.playgroundCatalog}>
      <div className={styles.playgroundCatalogTitle}><strong>{section === 'mcp' ? 'Tools' : 'Scenarios'}</strong><span>{section === 'mcp' ? 'Live catalog' : 'Capture matrix'}</span></div>
      <div className={`${styles.playgroundCatalogToolbar} ${section === 'mcp' ? styles.withCommand : ''}`}><label><Search aria-hidden="true" /><input aria-label="Search catalog" data-automation-id="playground.catalog.search" placeholder="Search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>{section === 'mcp' ? <button aria-label="Refresh tools" data-automation-id="playground.mcp.refresh" type="button" onClick={onRefreshTools}><RefreshCw aria-hidden="true" /></button> : null}</div>
      <div className={styles.playgroundCatalogScroll}>
        {section === 'mcp' ? <>{renderGroup('Queries', queryTools)}{renderGroup('Changes', changeTools)}</> : scenarioGroups.map((group) => (
          <section className={styles.playgroundGroup} key={group}>
            <header><span>{group}</span><code>{trafficScenarios.filter((scenario) => scenario.group === group).length}</code></header>
            {visibleScenarios.filter((scenario) => scenario.group === group).map((scenario) => (
              <button className={selectedScenarioId === scenario.id ? styles.selected : ''} data-scenario-id={scenario.id} key={scenario.id} type="button" onClick={() => onSelectScenario(scenario.id)}>
                <span><strong>{scenario.title}</strong></span>
                <small>{scenario.description}</small>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );

  function renderGroup(title: string, items: readonly PlaygroundMcpTool[]): React.JSX.Element | null {
    if (items.length === 0) return null;
    return <section className={styles.playgroundGroup}><header><span>{title}</span><code>{items.length}</code></header>{items.map((tool) => <button className={selectedToolName === tool.name ? styles.selected : ''} data-automation-id={`playground.mcp.tool.${tool.name}`} key={tool.name} type="button" onClick={() => onSelectTool(tool.name)}><span><strong>{tool.title ?? tool.name}</strong><em data-kind={tool.annotations?.readOnlyHint ? 'query' : 'change'}>{tool.annotations?.readOnlyHint ? 'query' : 'change'}</em></span><code>{tool.name}</code></button>)}</section>;
  }
}