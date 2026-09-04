import { Input, Switch } from 'antd';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import {
  ToolCapabilitySettingsActions,
  useToolCapabilitySettingsStore,
} from '../data/toolCapabilitySettingsStore';
import styles from './AgentToolCapabilities.module.css';

/** Renders the Main-owned Tool registry projection and independent exposure switches. */
export function AgentToolCapabilities(): React.JSX.Element {
  const { t } = useTranslation();
  const snapshot = useToolCapabilitySettingsStore((state) => state.snapshot);
  const loading = useToolCapabilitySettingsStore((state) => state.loading);
  const busy = useToolCapabilitySettingsStore((state) => state.busy);
  const error = useToolCapabilitySettingsStore((state) => state.error);
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();
  const agentDisabledToolNames = new Set(snapshot?.agentDisabledToolNames ?? []);
  const mcpDisabledToolNames = new Set(snapshot?.mcpDisabledToolNames ?? []);
  const groups = (snapshot?.groups ?? []).map((group) => ({
    ...group,
    tools: group.tools.filter((tool) => (
      normalizedSearch.length === 0
      || tool.name.includes(normalizedSearch)
      || tool.title.toLowerCase().includes(normalizedSearch)
      || tool.description.toLowerCase().includes(normalizedSearch)
    )),
  })).filter((group) => group.tools.length > 0);

  useEffect(() => {
    void ToolCapabilitySettingsActions.load().catch(() => undefined);
  }, []);

  const setAgentEnabled = (toolName: string, enabled: boolean): void => {
    const operation = enabled
      ? ToolCapabilitySettingsActions.enableAgentTool(toolName)
      : ToolCapabilitySettingsActions.disableAgentTool(toolName);
    void operation.catch(() => undefined);
  };

  const setMcpEnabled = (toolName: string, enabled: boolean): void => {
    const operation = enabled
      ? ToolCapabilitySettingsActions.enableMcpTool(toolName)
      : ToolCapabilitySettingsActions.disableMcpTool(toolName);
    void operation.catch(() => undefined);
  };

  return (
    <section
      aria-busy={loading || busy}
      className={styles.toolCapabilities}
      data-automation-id={AUTOMATION_IDS.agent.tools.capabilities}
      data-parity="agent-tool-capabilities"
    >
      <header className={styles.toolCapabilitiesHeader}>
        <div className={styles.toolCapabilitiesHeading}>
          <strong>{t('settings.agent.tools.title')}</strong>
          <span>{t('settings.agent.tools.description')}</span>
        </div>
        <Input
          aria-label={t('settings.agent.tools.search')}
          className={styles.toolCapabilitiesSearch}
          data-automation-id={AUTOMATION_IDS.agent.tools.search}
          prefix={<Search aria-hidden="true" />}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>
      <div className={styles.toolCapabilitiesColumns} aria-hidden="true">
        <span>{t('settings.agent.tools.capability')}</span>
        <span>Agent</span>
        <span>MCP</span>
      </div>
      <div className={styles.toolCapabilityGroups}>
        {groups.map((group) => (
          <section
            className={styles.toolCapabilityGroup}
            data-automation-id={AutomationIdFactory.agentToolGroup(group.id)}
            key={group.id}
          >
            <header className={styles.toolCapabilityGroupHeader}>
              <strong>{group.title}</strong>
              <span>{group.tools.length}</span>
            </header>
            {group.tools.map((tool) => (
              <div
                className={styles.toolCapabilityRow}
                data-automation-id={AutomationIdFactory.agentToolRow(tool.name)}
                key={tool.name}
              >
                <div className={styles.toolCapabilityCopy}>
                  <div className={styles.toolCapabilityName}>
                    <strong>{tool.title}</strong>
                    <span data-kind={tool.kind}>{tool.kind}</span>
                  </div>
                  <div className={styles.toolCapabilityDetail}>
                    <code>{tool.name}</code>
                    <span>{tool.description}</span>
                  </div>
                </div>
                <Switch
                  aria-label={t('settings.agent.tools.enableAgent', { toolName: tool.name })}
                  checked={!agentDisabledToolNames.has(tool.name)}
                  data-automation-id={AutomationIdFactory.agentToolAgentSwitch(tool.name)}
                  disabled={loading || busy}
                  size="small"
                  onChange={(enabled) => setAgentEnabled(tool.name, enabled)}
                />
                <Switch
                  aria-label={t('settings.agent.tools.enableMcp', { toolName: tool.name })}
                  checked={!mcpDisabledToolNames.has(tool.name)}
                  data-automation-id={AutomationIdFactory.agentToolMcpSwitch(tool.name)}
                  disabled={loading || busy}
                  size="small"
                  onChange={(enabled) => setMcpEnabled(tool.name, enabled)}
                />
              </div>
            ))}
          </section>
        ))}
        {!loading && snapshot !== null && groups.length === 0 ? (
          <div className={styles.toolCapabilitiesEmpty}>
            {t('settings.agent.tools.noMatches')}
          </div>
        ) : null}
      </div>
      {error !== null ? (
        <div className={styles.toolCapabilitiesError} role="alert">{error}</div>
      ) : null}
    </section>
  );
}