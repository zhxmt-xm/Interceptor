// Screenshot pipeline for the unified design SPA.
// Opens index.html once, drives it via window.__setState(), captures the .app element.
// Two passes: framed (1600x900 app state) and full (scroll areas expanded so nothing hides).
// Run from repo root:  node design-vite/shoot.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';
import { startDesignPreview } from './tools/design-preview.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shotsRoot = path.join(dir, 'shots');

const FEATURES = ['capture', 'rules', 'composer', 'settings', 'diagnostics', 'playground'];
const TOKEN = { light: 'light', dark: 'dark' }; // folder name -> data-theme token
const onlyFeature = process.argv
  .find((argument) => argument.startsWith('--feature='))
  ?.split('=')[1];
const onlyVariant = process.argv
  .find((argument) => argument.startsWith('--variant='))
  ?.split('=')[1];

// Every shot declares { feature, theme, variant, state, full? }.
// Output path is shots/<theme>/<feature>/<variant>.png so light and dark stay separated.
const shots = [];
for (const feature of FEATURES) {
  for (const theme of ['light', 'dark']) {
    const base = { view: feature, theme: TOKEN[theme], sidebar: feature === 'capture' ? 'collapsed' : 'expanded', overlay: '', ...(feature === 'settings' ? { settings: 'certificates' } : {}) };
    shots.push({ feature, theme, variant: 'framed', state: base });
    shots.push({ feature, theme, variant: 'full', full: true, state: base });
  }
}
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'playground', theme, variant: 'tool-approval', state: { view: 'playground', theme: TOKEN[theme], playgroundSection: 'mcp', playgroundSelectedTool: 'capture_stop_recording', playgroundCallState: 'approval' } });
  shots.push({ feature: 'playground', theme, variant: 'capture-h1-json', state: { view: 'playground', theme: TOKEN[theme], playgroundSection: 'capture', playgroundSelectedScenario: 'h1-json', playgroundRequestDraft: '{\n  "body": "",\n  "headers": {\n    "accept": "application/json"\n  },\n  "kind": "http",\n  "method": "GET",\n  "path": "/playground/h1-json",\n  "protocol": "h1"\n}', playgroundCaptureDetailWidth: 560, playgroundMcpDetailWidth: 560, playgroundCallState: 'complete' } });
  shots.push({ feature: 'capture', theme, variant: 'sidebar-expanded', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '' } });
  shots.push({ feature: 'rules', theme, variant: 'collapsed', state: { view: 'rules', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '' } });
  shots.push({
    feature: 'agent-panel',
    theme,
    variant: 'capture-open',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', tab: 'headers', agentPanel: 'open' },
  });
  shots.push({
    feature: 'agent-panel',
    theme,
    variant: 'rules-open',
    appSize: { width: 1600, height: 900 },
    state: { view: 'rules', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open' },
  });
  shots.push({
    feature: 'agent-panel',
    theme,
    variant: 'new-chat',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentChat: 'new', agentCurrentModel: 'qwen' },
  });
  shots.push({
    feature: 'agent-panel',
    theme,
    variant: 'sent-message',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentChat: 'sent', agentMessage: 'How should I retry an invalid_grant response?' },
  });
  shots.push({
    feature: 'agent-panel',
    theme,
    variant: 'chat-menu',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentChatMenu: 'open' },
  });
  shots.push({
    feature: 'agent-panel',
    theme,
    variant: 'rename-chat',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentChatDialog: 'rename' },
  });
  shots.push({
    feature: 'agent-panel',
    theme,
    variant: 'delete-chat',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentChatDialog: 'delete' },
  });
  for (const agentTurnState of ['running', 'stopped', 'failed']) {
    shots.push({
      feature: 'agent-panel',
      theme,
      variant: `turn-${agentTurnState}`,
      appSize: { width: 1600, height: 900 },
      state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentChat: 'sent', agentMessage: 'Explain invalid_grant.', agentTurnState },
    });
  }
  shots.push({
    feature: 'agent-panel',
    theme,
    variant: 'session-usage',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentUsagePanel: 'open' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-agent',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-agent-unconfigured',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', agentProvider: 'unconfigured' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-agent-qwen-default',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', agentDefaultModel: 'qwen' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-tool-capabilities-filtered',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', agentToolSearch: 'exchange', agentDisabledTools: ['capture_get_exchange'] },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-mcp-running',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', mcpServerState: 'running', mcpEndpointAssigned: true, mcpClientLabel: 'VS Code', mcpClientExecutionMode: 'ask' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-mcp-conflict',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', mcpServerState: 'conflict', mcpEndpointAssigned: true, mcpClientLabel: 'VS Code' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-mcp-add-client',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', mcpServerState: 'running', mcpEndpointAssigned: true, mcpClientDialog: 'add' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-mcp-regenerate',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', mcpServerState: 'running', mcpEndpointAssigned: true, mcpClientLabel: 'VS Code', mcpClientDialog: 'regenerate' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'mcp-tool-approval',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', mcpToolApproval: 'pending' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-deepseek-dialog',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', agentProviderDialog: 'deepseek', agentProviderDialogMode: 'edit', agentProviderDialogTarget: 'deepseek' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-custom-dialog',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', agentProviderDialog: 'custom', agentProviderDialogMode: 'add', agentProviderDialogTarget: '' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-custom-edit-dialog',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', agentProviderDialog: 'custom', agentProviderDialogMode: 'edit', agentProviderDialogTarget: 'qwen' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-remove-model',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', agentRemoveModelTarget: 'qwen' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-unconfigured',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentProvider: 'unconfigured' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-model-menu',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentModelMenu: 'open' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-tool-approval',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentExecutionMode: 'ask', agentToolApproval: 'pending', agentToolApprovalName: 'capture_stop_recording' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-tool-result',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentExecutionMode: 'ask', agentToolApproval: 'allowed', agentToolApprovalName: 'capture_clear' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-auto',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentExecutionMode: 'auto' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-capture-tools',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentToolTrace: 'capture' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-body-message-tools',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentToolTrace: 'body-messages' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-breakpoint-tools',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentExecutionMode: 'auto', agentToolTrace: 'breakpoints' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-composer-tools',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentExecutionMode: 'auto', agentToolTrace: 'composer', agentToolApproval: 'allowed', agentToolApprovalName: 'composer_send_request' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-diagnostics-tools',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentExecutionMode: 'ask', agentToolTrace: 'diagnostics' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-settings-tools',
    appSize: { width: 1600, height: 900 },
    state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentExecutionMode: 'ask', agentToolTrace: 'settings' },
  });
  for (const tool of [
    'settings_replace_tls_insecure_hosts', 'settings_replace_tls_passthrough',
    'settings_enable_https_decryption', 'settings_disable_https_decryption',
  ]) {
    for (const approval of ['pending', 'allowed']) {
      shots.push({
        feature: 'agent-models', theme,
        variant: `panel-${tool}-${approval}`,
        appSize: { width: 1600, height: 900 },
        state: {
          view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '',
          agentPanel: 'open', agentExecutionMode: 'ask', agentToolApproval: approval,
          agentToolApprovalName: tool,
        },
      });
    }
  }
  for (const action of ['enable', 'restore']) {
    for (const approval of ['pending', 'allowed']) {
      shots.push({
        feature: 'agent-models', theme,
        variant: `panel-system-proxy-${action}-${approval}`,
        appSize: { width: 1600, height: 900 },
        state: {
          view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '',
          agentPanel: 'open', agentExecutionMode: 'ask', agentToolApproval: approval,
          agentToolApprovalName: `settings_${action}_system_proxy`,
        },
      });
    }
  }
  for (const stage of ['pending', 'allowed', 'canceled']) {
    shots.push({
      feature: 'agent-models', theme,
      variant: `panel-rules-export-${stage}`,
      appSize: { width: 1600, height: 900 },
      state: {
        view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '',
        agentPanel: 'open', agentExecutionMode: 'ask',
        agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
        agentToolApprovalName: 'rules_export', agentRulesExported: stage !== 'canceled',
      },
    });
  }
  for (const stage of ['pending', 'allowed', 'canceled']) {
    shots.push({
      feature: 'agent-models', theme,
      variant: `panel-rules-import-${stage}`,
      appSize: { width: 1600, height: 900 },
      state: {
        view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '',
        agentPanel: 'open', agentExecutionMode: 'ask',
        agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
        agentToolApprovalName: 'rules_import', agentRulesImported: stage !== 'canceled',
      },
    });
  }
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'settings-tool-capabilities-settings',
    appSize: { width: 1600, height: 900 },
    state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'agent', agentToolSearch: 'settings_', agentDisabledTools: ['settings_get_certificate_status'], mcpDisabledTools: ['settings_get_tls_passthrough'] },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-rules-tools',
    appSize: { width: 1600, height: 900 },
    state: { view: 'rules', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentToolTrace: 'rules' },
  });
  shots.push({
    feature: 'agent-models',
    theme,
    variant: 'panel-rules-result',
    appSize: { width: 1600, height: 900 },
    state: { view: 'rules', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentToolTrace: 'rules', agentToolApproval: 'allowed', agentToolApprovalName: 'rules_replace_tree' },
  });
}
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'capture', theme, variant: 'import-menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', fileMenu: 'import' } });
  shots.push({ feature: 'capture', theme, variant: 'export-menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', fileMenu: 'export' } });
  shots.push({ feature: 'import-export', theme, variant: 'export-har', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export', transfer: 'har-export' } });
  shots.push({ feature: 'import-export', theme, variant: 'import-har', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export', transfer: 'har-import' } });
  shots.push({ feature: 'import-export', theme, variant: 'save-capture', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export', transfer: 'archive-export' } });
  shots.push({ feature: 'import-export', theme, variant: 'open-capture', state: { view: 'capture', theme: TOKEN[theme], overlay: 'import-export', transfer: 'archive-import' } });
  shots.push({ feature: 'https-setup', theme, variant: 'dialog', state: { view: 'capture', theme: TOKEN[theme], overlay: 'https-setup', scene: 'tunnel', tab: 'tunnel' } });
  shots.push({ feature: 'https-setup', theme, variant: 'ready', state: { view: 'capture', theme: TOKEN[theme], overlay: 'https-setup', scene: 'tunnel', tab: 'tunnel', https: 'ready' } });
  shots.push({ feature: 'https-setup', theme, variant: 'decrypting', state: { view: 'capture', theme: TOKEN[theme], overlay: 'https-setup', scene: 'tunnel', tab: 'tunnel', https: 'ready', mitm: 'active' } });
  shots.push({ feature: 'proxy-not-ready', theme, variant: 'dialog', state: { view: 'capture', theme: TOKEN[theme], overlay: 'proxy-not-ready' } });
  shots.push({ feature: 'settings', theme, variant: 'proxy', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'proxy' } });
  shots.push({ feature: 'settings', theme, variant: 'app-containers', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'app-containers', appContainers: 'ready' } });
  shots.push({ feature: 'settings', theme, variant: 'app-containers-refreshing', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'app-containers', appContainers: 'refreshing' } });
  shots.push({ feature: 'settings', theme, variant: 'app-container-confirm', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: 'app-container-confirm', settings: 'app-containers', appContainers: 'ready' } });
  shots.push({ feature: 'settings', theme, variant: 'app-container-enable-all', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: 'app-container-enable-all', settings: 'app-containers', appContainers: 'ready' } });
  shots.push({ feature: 'settings', theme, variant: 'app-container-disable-all', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: 'app-container-disable-all', settings: 'app-containers', appContainers: 'ready' } });
  shots.push({ feature: 'settings', theme, variant: 'tls-passthrough', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'tls-passthrough', tlsPassthrough: 'ready', tlsCompatibility: '' } });
  shots.push({ feature: 'settings', theme, variant: 'tls-passthrough-invalid', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'tls-passthrough', tlsPassthrough: 'invalid', tlsCompatibility: '', tlsHostInput: 'not a host' } });
  shots.push({ feature: 'settings', theme, variant: 'tls-passthrough-empty', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'tls-passthrough', tlsPassthrough: 'empty', tlsCompatibility: '' } });
  for (const githubAuth of ['signed-out', 'authorizing', 'failed']) {
    shots.push({ feature: 'settings', theme, variant: `updates-auth-${githubAuth}`, state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'updates', update: 'authentication-required', githubAuth } });
  }
  for (const update of ['checking', 'available', 'downloading', 'downloaded', 'up-to-date', 'failed', 'unsupported']) {
    shots.push({ feature: 'settings', theme, variant: `updates-${update}`, state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'updates', update, githubAuth: 'signed-in' } });
  }
}
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'tls-compatibility', theme, variant: 'dialog', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: 'tls-compatibility', tlsCompatibility: 'closed', tlsCompatibilityHosts: ['rdweb.wvd.microsoft.com', 'windows365.microsoft.com', 'afdfp-rdgateway-r0.wvd.microsoft.com'] } });
  shots.push({ feature: 'tls-compatibility', theme, variant: 'after-add', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', settings: 'tls-passthrough', tlsPassthrough: 'ready', tlsPatterns: ['rdweb.wvd.microsoft.com', 'windows365.microsoft.com', 'afdfp-rdgateway-r0.wvd.microsoft.com'], tlsCompatibility: '' } });
}
// capture inspector tabs (Headers is the framed default)
for (const theme of ['light', 'dark']) {
  for (const tab of ['request', 'response', 'timing', 'cookies', 'tls']) {
    shots.push({ feature: 'capture', theme, variant: `inspector-${tab}`, state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', tab } });
  }
  shots.push({ feature: 'capture', theme, variant: 'inspector-copy-actions', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', tab: 'headers', copy: 'error' } });
  shots.push({ feature: 'capture', theme, variant: 'request-rule-menu', interaction: 'request-menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', tab: 'headers', requestMenu: '' } });
  shots.push({ feature: 'capture', theme, variant: 'rule-filter', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', tab: 'headers', ruleFilter: 'rule-stub' } });
    shots.push({ feature: 'capture', theme, variant: 'rule-filter-disabled', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filterGroup: 'rule', ruleOptions: 'empty' } });
  for (const bodyPreview of ['json', 'tree', 'tree-menu', 'raw', 'hex', 'code', 'formatting', 'limited', 'format-off', 'image', 'image-large', 'binary', 'form', 'md', 'md-split', 'md-source', 'media']) {
    shots.push({ feature: 'capture', theme, variant: `body-${bodyPreview}`, state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', tab: 'response', bodyPreview } });
  }
  for (const bodyRuleEffect of ['request-text', 'request-file', 'response-text', 'response-file']) {
    shots.push({
      feature: 'capture',
      theme,
      variant: `body-effect-${bodyRuleEffect}`,
      state: {
        view: 'capture',
        theme: TOKEN[theme],
        sidebar: 'collapsed',
        overlay: '',
        detail: 'open',
        scene: 'http',
        tab: bodyRuleEffect.startsWith('request-') ? 'request' : 'response',
        bodyPreview: 'json',
        bodyRuleEffect,
        breakpointState: '',
      },
    });
  }
  shots.push({ feature: 'capture', theme, variant: 'body-full', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: 'body-full', detail: 'open', tab: 'response', bodyPreview: 'code' } });
  shots.push({ feature: 'capture', theme, variant: 'inspector-websocket', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-setup', interaction: 'websocket-breakpoint-setup', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: '', websocketBreakpoint: 'setup', websocketBreakpointDirection: 'both', websocketBreakpointFrames: ['message'] } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-enabled', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: '', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'both', websocketBreakpointFrames: ['message'] } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-paused-sent', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: 'websocket', breakpointBody: 'ready', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'both', websocketMessageDirection: 'sent', websocketMessagePayload: 'text' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-queue-head', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: 'websocket', breakpointBody: 'ready', breakpointQueueSelection: 'websocket-head', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'both', websocketMessageDirection: 'sent', websocketMessagePayload: 'text' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-queue-queued', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: 'websocket', breakpointBody: 'ready', breakpointQueueSelection: 'websocket-queued', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'both', websocketMessageDirection: 'sent', websocketMessagePayload: 'text' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-paused-received-binary', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: 'websocket', breakpointBody: 'ready', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'received', websocketMessageDirection: 'received', websocketMessagePayload: 'binary' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-replace', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: 'websocket', breakpointBody: 'replace', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'both', websocketMessageDirection: 'sent', websocketMessagePayload: 'text' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-paused-ping', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: 'websocket', breakpointBody: 'ready', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'sent', websocketBreakpointFrames: ['message', 'ping'], websocketMessageDirection: 'sent', websocketMessagePayload: 'ping' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-paused-close', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: 'websocket', breakpointBody: 'ready', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'received', websocketBreakpointFrames: ['message', 'close'], websocketMessageDirection: 'received', websocketMessagePayload: 'close' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-breakpoint-close-edit', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: 'websocket', breakpointBody: 'replace', websocketBreakpoint: 'enabled', websocketBreakpointDirection: 'received', websocketBreakpointFrames: ['message', 'close'], websocketMessageDirection: 'received', websocketMessagePayload: 'close' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-upgrade-request-paused', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'headers', breakpointState: 'websocket-upgrade-request', websocketUpgradeResponse: 'accepted' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-upgrade-response-paused', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'headers', breakpointState: 'websocket-upgrade-response', websocketUpgradeResponse: 'accepted' } });
  shots.push({ feature: 'capture', theme, variant: 'websocket-upgrade-response-mock-error', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'headers', breakpointState: 'websocket-upgrade-response', websocketUpgradeResponse: 'mock-error' } });
  shots.push({ feature: 'capture', theme, variant: 'inspector-grpc', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'grpc', tab: 'grpc' } });
  shots.push({ feature: 'capture', theme, variant: 'inspector-tunnel', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'tunnel', tab: 'tunnel' } });
  shots.push({ feature: 'capture', theme, variant: 'inspector-tunnel-mitm-active', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'tunnel', tab: 'tunnel', mitm: 'active' } });
  shots.push({ feature: 'settings', theme, variant: 'tls-passthrough-target', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'tls-passthrough', tlsPassthrough: 'ready', tlsPassthroughTargetHost: 'afdfp-rdgateway-r0.wvd.microsoft.com', tlsPassthroughTargetPattern: '*.wvd.microsoft.com', tlsPassthroughTargetSequence: 1, tlsPassthroughTargetExpires: false } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoints-off', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', breakpoints: 'off' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-request-paused', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'request' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-request-body-loading', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'request', breakpointBody: 'loading' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-request-body-loaded', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'request', breakpointBody: 'ready' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-request-body-replace', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'request', breakpointBody: 'replace' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-request-body-file-empty', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'request', breakpointBody: 'file', breakpointFile: 'none' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-request-body-file', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'request', breakpointBody: 'file', breakpointFile: 'valid' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-response-paused', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'response' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-response-body-loaded', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'response', breakpointBody: 'ready' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-response-body-replace', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'response', breakpointBody: 'replace' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-response-body-file-empty', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'response', breakpointBody: 'file', breakpointFile: 'none' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-response-body-file', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'response', breakpointBody: 'file', breakpointFile: 'valid' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-queue-menu', interaction: 'breakpoint-queue-menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'queue', breakpointQueueSelection: 'http-head' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-queue-head', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'queue', breakpointQueueSelection: 'http-head' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-queue-queued', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', breakpoints: 'on', breakpointState: 'queue', breakpointQueueSelection: 'http-queued' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-create-menu', interaction: 'breakpoint-menu', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: '', breakpoints: 'on', requestMenu: '' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-manager', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: '', breakpoints: 'on', breakpointPanel: 'open' } });
  shots.push({ feature: 'capture', theme, variant: 'breakpoint-created-message', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: '', breakpoints: 'on', breakpointMessage: 'created' } });
}
// rules add-action popover
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'rules', theme, variant: 'add-action', state: { view: 'rules', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', pop: true } });
  shots.push({ feature: 'rules', theme, variant: 'select-dropdown', state: { view: 'rules', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', ruleSelect: 'open' } });
  shots.push({ feature: 'rules', theme, variant: 'breakpoint-action', state: { view: 'rules', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', ruleBreakpointAction: 'visible' } });
}
// rules list shapes: today's flat rows vs. the folder tree, with and without the match summary
for (const theme of ['light', 'dark']) {
  const base = { view: 'rules', theme: TOKEN[theme], sidebar: 'expanded', overlay: '' };
  shots.push({ feature: 'rules', theme, variant: 'action-tag-overflow', interaction: 'rule-action-tags', state: base });
  shots.push({ feature: 'rules', theme, variant: 'tree-root-menu', state: { ...base, ctxmenu: 'rules-root' } });
  shots.push({ feature: 'rules', theme, variant: 'import-confirm', state: { ...base, overlay: 'rules-import' } });
  shots.push({ feature: 'rules', theme, variant: 'import-loading', state: { ...base, overlay: 'rules-import-loading' } });
  shots.push({ feature: 'rules', theme, variant: 'export-loading', state: { ...base, overlay: 'rules-export-loading' } });
  shots.push({ feature: 'rules', theme, variant: 'tree-folder-actions', state: { ...base }, hover: '.rgrp[data-rgrp="staging"] > .rgrp-h' });
  shots.push({ feature: 'rules', theme, variant: 'tree-collapsed', state: { ...base, sidebar: 'collapsed' } });
  shots.push({ feature: 'rules', theme, variant: 'font-current', state: { ...base, ruleTypography: 'current' } });
}
// composer request/response tabs and send phases
for (const theme of ['light', 'dark']) {
  const base = { view: 'composer', theme: TOKEN[theme], sidebar: 'expanded', overlay: '' };
  shots.push({ feature: 'composer', theme, variant: 'import-confirm', state: { ...base, overlay: 'composer-import' } });
  shots.push({ feature: 'composer', theme, variant: 'import-loading', state: { ...base, overlay: 'composer-import-loading' } });
  shots.push({ feature: 'composer', theme, variant: 'export-loading', state: { ...base, overlay: 'composer-export-loading' } });
  shots.push({ feature: 'composer', theme, variant: 'request-query', state: { ...base, composerTab: 'query' } });
  shots.push({ feature: 'composer', theme, variant: 'request-body', state: { ...base, composerTab: 'body' } });
  shots.push({ feature: 'composer', theme, variant: 'request-body-form', state: { ...base, composerTab: 'body', bodyType: 'form' } });
  shots.push({ feature: 'composer', theme, variant: 'request-body-none', state: { ...base, composerTab: 'body', bodyType: 'none' } });
  shots.push({ feature: 'composer', theme, variant: 'request-auth', state: { ...base, composerTab: 'auth' } });
  shots.push({ feature: 'composer', theme, variant: 'response-headers', state: { ...base, composerResponseTab: 'headers' } });
  shots.push({ feature: 'composer', theme, variant: 'response-cookies', state: { ...base, composerResponseTab: 'cookies' } });
  shots.push({ feature: 'composer', theme, variant: 'response-timing', state: { ...base, composerResponseTab: 'timing' } });
  shots.push({ feature: 'composer', theme, variant: 'empty', state: { ...base, composer: 'empty' } });
  shots.push({ feature: 'composer', theme, variant: 'sending', state: { ...base, composer: 'sending' } });
  shots.push({ feature: 'composer', theme, variant: 'history', state: { ...base, composerHistory: 'open' } });
  shots.push({ feature: 'composer', theme, variant: 'collection-collapsed', state: { ...base, collection: 'closed' } });
  shots.push({ feature: 'composer', theme, variant: 'collection-folder-menu', state: { ...base, ctxmenu: 'composer-folder' } });
  shots.push({ feature: 'composer', theme, variant: 'collection-rename', state: { ...base, collectionRename: 'on' } });
  shots.push({ feature: 'composer', theme, variant: 'collection-folder-actions', state: base, hover: '.cgrp[data-grp="checkout"] > .cgrp-h' });
}
// capture filter panel scenes (facets replaced the old add-filter popover)
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'capture', theme, variant: 'filters-collapsed', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filters: 'closed' } });
  shots.push({ feature: 'capture', theme, variant: 'filters-collapsed-active', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filters: 'closed', filterActive: 'on' } });
  shots.push({ feature: 'capture', theme, variant: 'filters-active', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filterActive: 'on' } });
  shots.push({ feature: 'capture', theme, variant: 'filters-group-clear', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filterActive: 'on' }, hover: '.fgrp[data-grp="application"] .fgrp-h' });
  shots.push({ feature: 'capture', theme, variant: 'filters-method', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filterGroup: 'method' } });
  shots.push({ feature: 'capture', theme, variant: 'filters-host', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filterGroup: 'host' } });
  shots.push({ feature: 'capture', theme, variant: 'filters-status', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filterGroup: 'status' } });
  shots.push({ feature: 'capture', theme, variant: 'filters-protocol', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filterGroup: 'protocol' } });
  shots.push({ feature: 'capture', theme, variant: 'filters-type', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', filterGroup: 'type' } });
  shots.push({ feature: 'capture', theme, variant: 'filters-search', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', search: '/v1/user' } });
  shots.push({ feature: 'capture', theme, variant: 'recording-loading', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', recording: 'pending' } });
  shots.push({ feature: 'capture', theme, variant: 'recording-paused', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', recording: 'paused' } });
  shots.push({ feature: 'capture', theme, variant: 'statusbar-decrypting', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', mitm: 'active' } });
  shots.push({ feature: 'capture', theme, variant: 'statusbar-direct', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', systemProxy: 'off', upstream: '' } });
  shots.push({ feature: 'capture', theme, variant: 'statusbar-upstream-down', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', upstream: 'down' } });
}
// Default shell: a dedicated global window header with feature tools inside content.
for (const theme of ['light', 'dark']) {
  shots.push({ feature: 'shell-v2', theme, variant: 'capture', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '' } });
  shots.push({ feature: 'shell-v2', theme, variant: 'capture-collapsed', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '' } });
  for (const feature of ['rules', 'composer', 'settings', 'diagnostics']) {
    shots.push({ feature: 'shell-v2', theme, variant: feature, state: { view: feature, theme: TOKEN[theme], sidebar: 'expanded', overlay: '' } });
  }
}
// Startup loading screen: one shot per step of the boot sequence.
for (const theme of ['light', 'dark']) {
  for (const boot of ['core', 'listener', 'proxy', 'ready', 'error']) {
    shots.push({ feature: 'boot', theme, variant: boot, state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', boot } });
  }
}

const STABILIZE = '*{caret-color:transparent!important}body:not(.menu-interaction-shot) *{transition:none!important;animation:none!important}.monaco-editor .cursors-layer{display:none!important}body.menu-interaction-shot{padding:0!important;align-items:flex-start!important;justify-content:flex-start!important}';
const FULL_CSS = `
.app{height:auto!important;min-height:900px!important}
.mainhost,.mv{overflow:visible!important}
.listwrap,.cfilters-scroll,.rlist,.reditor,.insp,.scroll,.edscroll,.ccol-scroll,.creq,.cresp,.cpane,.cscroll,.cedit,.jsonv,
.snav,.scontent,.break-inspector,.break-scroll,.dlist,.ddetail,.dscroll{overflow:visible!important;max-height:none!important}
`;

const selectedShots = shots.filter((shot) =>
  (!onlyFeature || shot.feature === onlyFeature) &&
  (!onlyVariant || shot.variant === onlyVariant),
);

// Only clean feature directories owned by this run; preserve scene scripts.
const selectedDirectories = new Set(
  selectedShots.map((shot) => path.join(shotsRoot, shot.theme, shot.feature)),
);
if (!onlyVariant) {
  await Promise.all(
    [...selectedDirectories].map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
}
await mkdir(shotsRoot, { recursive: true });

const designPreview = await startDesignPreview(dir);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1680, height: 1000 } });
await page.goto(designPreview.url, { waitUntil: 'load', timeout: 120_000 });
await page.waitForFunction(() => window.__monacoReady === true, null, { timeout: 120_000 });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: STABILIZE });
await page.evaluate(() => { const c = document.querySelector('.dock'); if (c) c.style.display = 'none'; });
await page.waitForTimeout(250);

const app = page.locator('.app');
async function shoot(list) {
  let previousInteraction = '';
  for (const s of list) {
    if (
      s.interaction === 'breakpoint-queue-menu'
      || s.interaction === 'websocket-breakpoint-setup'
      || previousInteraction === 'rule-action-tags'
    ) {
      await page.reload({ waitUntil: 'load', timeout: 120_000 });
      await page.waitForFunction(() => window.__monacoReady === true, null, { timeout: 120_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: STABILIZE });
      await page.evaluate(() => {
        const controls = document.querySelector<HTMLElement>('.dock');
        if (controls) controls.style.display = 'none';
      });
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => window.__setState({
      overlay: '',
      fileMenu: '',
      requestMenu: '',
      breakpointState: '',
      breakpointQueueSelection: 'http-head',
      breakpointQueueMenu: '',
      breakpointPanel: '',
      breakpointMessage: '',
      websocketBreakpoint: 'disabled',
      pop: false,
      pop2: '',
      ctxmenu: '',
      agentPanel: 'closed',
      agentProviderDialog: '',
      agentRulesExported: true,
      agentRulesImported: true,
      agentProviderDialogMode: 'add',
      agentProviderDialogTarget: '',
      agentModelMenu: '',
      agentCurrentModel: 'deepseek',
      agentChat: 'checkout',
      agentChatTitle: 'Checkout failures',
      agentChatDialog: '',
      agentTurnState: 'idle',
      agentChatMenu: '',
      agentMessage: '',
      agentUsagePanel: '',
      agentExecutionMode: 'ask',
      agentToolApproval: '',
      agentToolTrace: '',
      agentCheckoutExecutionMode: 'ask',
      agentCheckoutToolApproval: '',
      agentDeepSeekProfile: { displayName: 'DeepSeek V4 Flash', profileName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '••••••••••••••••9K4Q', modelId: 'deepseek-v4-flash', contextWindow: '1000000', maximumOutput: '8192' },
      agentQwenProfile: { displayName: 'Qwen3 Max', profileName: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '••••••••••••••••7M2P', modelId: 'qwen3-max', contextWindow: '131072', maximumOutput: '8192' },
      agentAddedProfile: null,
      agentRemovedModels: [],
      agentRemoveModelTarget: '',
      agentToolSearch: '',
      agentDisabledTools: [],
      mcpDisabledTools: [],
      mcpServerState: 'disabled',
      mcpEndpointAssigned: false,
      mcpClientLabel: '',
      mcpClientExecutionMode: 'ask',
      mcpClientDialog: '',
      mcpConfigCopied: false,
      mcpCredentialGeneration: 0,
      mcpToolApproval: '',
      playgroundSection: 'capture',
      playgroundSelectedTool: 'capture_get_proxy_status',
      playgroundSelectedScenario: 'h1-json',
      playgroundRequestDraft: '{\n  "body": "",\n  "headers": {\n    "accept": "application/json"\n  },\n  "kind": "http",\n  "method": "GET",\n  "path": "/playground/h1-json",\n  "protocol": "h1"\n}',
      playgroundCaptureDetailWidth: 560,
      playgroundMcpDetailWidth: 560,
      playgroundCallState: 'complete',
      playgroundManualStatus: 'not-run',
    }));
    for (let depth = 0; depth < 2; depth += 1) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
    }
    const windowTitle = page.locator('[data-parity="window-header-title"]:visible').first();
    if (await windowTitle.count()) {
      await windowTitle.click();
      await page.waitForTimeout(120);
    }
    await page.evaluate((interaction) => {
      document.body.classList.toggle(
        'menu-interaction-shot',
        interaction === 'breakpoint-menu'
          || interaction === 'breakpoint-queue-menu'
          || interaction === 'websocket-breakpoint-setup',
      );
    }, s.interaction);
    await page.evaluate((st) => window.__setState({
      overlay: '',
      fileMenu: '',
      settings: 'certificates',
      update: 'up-to-date',
      githubAuth: 'signed-in',
      appContainers: 'ready',
      tlsPassthrough: 'ready',
      tlsPassthroughTargetHost: '',
      tlsPassthroughTargetPattern: '',
      tlsPassthroughTargetSequence: 0,
      tlsPassthroughTargetExpires: false,
      tlsCompatibility: '',
      tlsHostInput: '',
      https: 'fresh',
      mitm: 'inactive',
      systemProxy: 'on',
      upstream: 'on',
      copy: 'hidden',
      transfer: '',
      requestMenu: '',
      ruleFilter: '',
      ruleOptions: '',
      bodyPreview: '',
      bodyRuleEffect: '',
      filters: 'open',
      filterGroup: '',
      filterActive: '',
      recording: '',
      breakpoints: 'on',
      breakpointState: '',
      breakpointBody: 'loading',
      breakpointFile: 'none',
      breakpointPanel: '',
      breakpointMessage: '',
      breakpointQueueSelection: 'http-head',
      breakpointQueueMenu: '',
      ruleBreakpointAction: '',
      websocketBreakpoint: 'disabled',
      websocketBreakpointDirection: 'both',
      websocketBreakpointFrames: ['message'],
      websocketMessageDirection: 'sent',
      websocketMessagePayload: 'text',
      ruleTypography: 'composer',
      composer: '',
      collection: 'open',
      collectionRename: '',
      composerHistory: '',
      agentPanel: 'closed',
      agentProvider: 'configured',
      agentRulesExported: true,
      agentRulesImported: true,
      agentProviderDialog: '',
      agentProviderDialogMode: 'add',
      agentProviderDialogTarget: '',
      agentModelMenu: '',
      agentDefaultModel: 'deepseek',
      agentCurrentModel: 'deepseek',
      agentChat: 'checkout',
      agentChatTitle: 'Checkout failures',
      agentChatDialog: '',
      agentTurnState: 'idle',
      agentChatMenu: '',
      agentMessage: '',
      agentUsagePanel: '',
      agentExecutionMode: 'ask',
      agentToolApproval: '',
      agentToolTrace: '',
      agentCheckoutExecutionMode: 'ask',
      agentCheckoutToolApproval: '',
      agentDeepSeekProfile: { displayName: 'DeepSeek V4 Flash', profileName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '••••••••••••••••9K4Q', modelId: 'deepseek-v4-flash', contextWindow: '1000000', maximumOutput: '8192' },
      agentQwenProfile: { displayName: 'Qwen3 Max', profileName: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '••••••••••••••••7M2P', modelId: 'qwen3-max', contextWindow: '131072', maximumOutput: '8192' },
      agentAddedProfile: null,
      agentRemovedModels: [],
      agentRemoveModelTarget: '',
      agentToolSearch: '',
      agentDisabledTools: [],
      mcpDisabledTools: [],
      mcpServerState: 'disabled',
      mcpEndpointAssigned: false,
      mcpClientLabel: '',
      mcpClientExecutionMode: 'ask',
      mcpClientDialog: '',
      mcpConfigCopied: false,
      mcpCredentialGeneration: 0,
      mcpToolApproval: '',
      bodyType: 'json',
      ctxmenu: '',
      boot: '',
      detail: '',
      ...st,
    }), s.state);
    await page.evaluate((appSize) => {
      const designApp = document.querySelector('.app');
      if (!(designApp instanceof HTMLElement)) return;
      designApp.style.width = `${appSize.width}px`;
      designApp.style.height = `${appSize.height}px`;
    }, s.appSize ?? { width: 1600, height: 900 });
    await page.waitForTimeout(140);
    if (
      s.interaction === 'request-menu'
      || s.interaction === 'breakpoint-menu'
    ) {
      await page.locator('.list-scroll .row').filter({ visible: true }).first().click({ button: 'right' });
    }
    if (s.interaction === 'breakpoint-menu') {
      await page.evaluate(() => {
        document.querySelector('.ant-dropdown-menu-submenu-title')
          ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
      await page.waitForTimeout(300);
    }
    if (s.interaction === 'websocket-breakpoint-setup') {
      await page.waitForTimeout(300);
    }
    if (s.interaction === 'breakpoint-queue-menu') {
      await page.getByRole('button', { name: 'Queue actions' }).click();
      await page.getByRole('menu', { name: 'Queue actions' }).waitFor();
    }
    if (s.interaction === 'rule-action-tags') {
      await page.getByRole('button', { name: 'Show all 4 actions' }).hover();
      await page.getByRole('tooltip').waitFor();
    }
    if (
      s.interaction !== 'request-menu'
      && s.interaction !== 'breakpoint-menu'
      && s.interaction !== 'websocket-breakpoint-setup'
      && s.interaction !== 'breakpoint-queue-menu'
      && await page.locator('.ant-dropdown:visible').count() > 0
    ) {
      throw new Error(`Unexpected open Dropdown before ${s.theme}/${s.feature}/${s.variant}`);
    }
    // Monaco hosts inside a hidden tab measure as zero until the tab is visible.
    await page.evaluate(() => window.__monacoRelayout());
    await page.waitForTimeout(60);
    if (s.hover) await page.hover(s.hover);
    else if (!s.interaction) await page.mouse.move(0, 0);
    const dest = path.join(shotsRoot, s.theme, s.feature);
    await mkdir(dest, { recursive: true });
    const outputPath = path.join(dest, `${s.variant}.png`);
    if (
      s.interaction === 'request-menu'
      || s.interaction === 'breakpoint-menu'
      || s.interaction === 'websocket-breakpoint-setup'
      || s.interaction === 'breakpoint-queue-menu'
    ) {
      const clip = await app.boundingBox();
      if (!clip) throw new Error('Design app is not visible');
      await page.screenshot({ path: outputPath, clip });
    } else {
      await app.screenshot({ path: outputPath });
    }
    console.log('  ✓', `${s.theme}/${s.feature}/${s.variant}`);
    previousInteraction = s.interaction ?? '';
  }
}

const framedShots = selectedShots.filter((shot) => !shot.full);
const fullShots = selectedShots.filter((shot) => shot.full);

console.log('framed:');
await shoot(framedShots);
console.log('full-content:');
await page.addStyleTag({ content: FULL_CSS });
await shoot(fullShots);

await browser.close();
await designPreview.close();
console.log(`\nDone — ${selectedShots.length} shots → ${shotsRoot}`);
