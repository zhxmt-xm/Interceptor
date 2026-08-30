import { Input, Switch } from 'antd';
import { Search } from 'lucide-react';

import { useDesignState } from '../../state/useDesignState';
import { AGENT_TOOL_CAPABILITY_GROUPS } from './toolCapabilityCatalog';
import styles from './AgentToolCapabilities.module.css';

export function AgentToolCapabilities(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const query = state.agentToolSearch.trim().toLowerCase();
  const groups = AGENT_TOOL_CAPABILITY_GROUPS.map((group) => ({
    ...group,
    tools: group.tools.filter((tool) => (
      query.length === 0
      || tool.name.includes(query)
      || tool.label.toLowerCase().includes(query)
      || tool.description.toLowerCase().includes(query)
    )),
  })).filter((group) => group.tools.length > 0);

  const toggleAgent = (name: string): void => {
    const disabled = new Set(state.agentDisabledTools);
    if (disabled.has(name)) disabled.delete(name);
    else disabled.add(name);
    updateState({ agentDisabledTools: [...disabled] });
  };

  const toggleMcp = (name: string): void => {
    const disabled = new Set(state.mcpDisabledTools);
    if (disabled.has(name)) disabled.delete(name);
    else disabled.add(name);
    updateState({ mcpDisabledTools: [...disabled] });
  };

  return (
    <section className={styles.toolCapabilities} data-parity="agent-tool-capabilities">
      <header className={styles.toolCapabilitiesHeader}>
        <div className={styles.toolCapabilitiesHeading}>
          <strong>Tool capabilities</strong>
          <span>Choose which implemented tools are available to Agent and MCP.</span>
        </div>
        <Input
          aria-label="Search Tool capabilities"
          className={styles.toolCapabilitiesSearch}
          prefix={<Search aria-hidden="true" />}
          type="search"
          value={state.agentToolSearch}
          onChange={(event) => updateState({ agentToolSearch: event.target.value })}
        />
      </header>
      <div className={styles.toolCapabilitiesColumns} aria-hidden="true">
        <span>Capability</span>
        <span>Agent</span>
        <span>MCP</span>
      </div>
      <div className={styles.toolCapabilityGroups}>
        {groups.map((group) => (
          <section className={styles.toolCapabilityGroup} key={group.label}>
            <header className={styles.toolCapabilityGroupHeader}>
              <strong>{group.label}</strong>
              <span>{group.tools.length}</span>
            </header>
            {group.tools.map((tool) => (
              <div className={styles.toolCapabilityRow} data-tool-capability={tool.name} key={tool.name}>
                <div className={styles.toolCapabilityCopy}>
                  <div className={styles.toolCapabilityName}>
                    <strong>{tool.label}</strong>
                    <span data-kind={tool.kind}>{tool.kind}</span>
                  </div>
                  <div className={styles.toolCapabilityDetail}>
                    <code>{tool.name}</code>
                    <span>{tool.description}</span>
                  </div>
                </div>
                <Switch
                  aria-label={`Enable ${tool.name} for Agent`}
                  checked={!state.agentDisabledTools.includes(tool.name)}
                  size="small"
                  onChange={() => toggleAgent(tool.name)}
                />
                <Switch
                  aria-label={`Enable ${tool.name} for MCP`}
                  checked={!state.mcpDisabledTools.includes(tool.name)}
                  size="small"
                  onChange={() => toggleMcp(tool.name)}
                />
              </div>
            ))}
          </section>
        ))}
        {groups.length === 0 ? (
          <div className={styles.toolCapabilitiesEmpty}>No matching capabilities</div>
        ) : null}
      </div>
    </section>
  );
}