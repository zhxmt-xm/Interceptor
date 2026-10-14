// Screenshot pipeline for the unified design SPA.
// Opens index.html once, drives it via window.__setState(), captures the .app element.
// Two passes: framed (1600x900 app state) and full (scroll areas expanded so nothing hides).
// Run from repo root:  node design-vite/shoot.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { startDesignPreview } from './tools/design-preview.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shotsRoot = path.resolve(process.argv
  .find((argument) => argument.startsWith('--out-dir='))
  ?.slice('--out-dir='.length) ?? path.join(dir, 'shots'));

const FEATURES = ['capture', 'rules', 'composer', 'settings', 'diagnostics', 'playground'];
const TOKEN = { light: 'light', dark: 'dark' }; // folder name -> data-theme token
const GRPC_LONG_MESSAGE = 'catalog-stream-4281\n' + JSON.stringify({
  requestId: 'catalog-stream-4281',
  region: 'ap-east-1',
  products: Array.from({ length: 18 }, (_, index) => ({
    id: `sku-${1042 + index}`,
    name: `Wireless keyboard ${index + 1}`,
    price: 89.9,
    currency: 'USD',
    available: true,
  })),
  nextPageToken: '',
}, null, 2);
const onlyFeature = process.argv
  .find((argument) => argument.startsWith('--feature='))
  ?.split('=')[1];
const onlyVariant = process.argv
  .find((argument) => argument.startsWith('--variant='))
  ?.split('=')[1];
const onlyTheme = process.argv
  .find((argument) => argument.startsWith('--theme='))
  ?.split('=')[1];

// Every shot declares { feature, theme, variant, state, full? }.
// Output path is shots/<theme>/<feature>/<variant>.png so light and dark stay separated.
const shots = [];
for (const theme of ['light', 'dark']) {
  for (const homepageGuidePage of ['resources', 'overview', 'capture']) {
    shots.push({
      feature: 'homepage-guide', theme, variant: homepageGuidePage,
      state: { view: 'playground', theme, homepageGuidePreview: true, homepageGuidePage },
    });
  }
  for (const homepageGuidePage of ['overview', 'capture']) {
    shots.push({
      feature: 'homepage-guide', theme, variant: `${homepageGuidePage}-full`, full: true,
      state: { view: 'playground', theme, homepageGuidePreview: true, homepageGuidePage },
    });
  }
}
for (const theme of ['light', 'dark']) {
  for (const [variant, mode, notice] of [
    ['breakpoint-request-original-long', 'original', 'none'],
    ['breakpoint-request-file-long', 'file', 'none'],
    ['breakpoint-request-text-long', 'text', 'none'],
    ['breakpoint-request-file-manual', 'file', 'manual-format'],
    ['breakpoint-request-file-truncated', 'file', 'truncated'],
    ['breakpoint-request-file-image-limit', 'file', 'image-limit'],
  ]) {
    shots.push({
      feature: 'capture', theme, variant, interaction: `http-body-${mode}`,
      state: {
        view: 'capture', theme, sidebar: 'collapsed', overlay: '', detail: 'open',
        scene: 'http', tab: 'headers', breakpointState: 'request', breakpointBody: 'ready',
        breakpointFile: 'none', bodyRemainderSample: 'long', bodyRemainderNotice: notice,
      },
    });
  }
}
for (const theme of ['light', 'dark', 'warm', 'ember']) {
  const state = {
    view: 'capture', theme, sidebar: 'collapsed', overlay: '',
    detail: 'open', scene: 'grpc', tab: 'grpc', grpcMessageSource: GRPC_LONG_MESSAGE,
  };
  shots.push({ feature: 'capture', theme, variant: 'inspector-grpc-long-text', interaction: 'grpc-text', state });
  shots.push({
    feature: 'capture', theme, variant: 'inspector-grpc-long-text-resized',
    interaction: 'grpc-text', resizeBodyDelta: -120, state,
  });
  if (theme === 'light' || theme === 'dark') {
    shots.push({ feature: 'capture', theme, variant: 'inspector-grpc-long-text-full', full: true, interaction: 'grpc-text', state });
  } else {
    shots.push({ feature: 'capture', theme, variant: 'inspector-websocket',
      state: { view: 'capture', theme, sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages' } });
  }
}
for (const feature of FEATURES) {
  for (const theme of ['light', 'dark']) {
    const base = { view: feature, theme: TOKEN[theme], sidebar: feature === 'capture' ? 'collapsed' : 'expanded', overlay: '', ...(feature === 'settings' ? { settings: 'certificates' } : {}) };
    shots.push({ feature, theme, variant: 'framed', state: base });
    shots.push({ feature, theme, variant: 'full', full: true, state: base });
  }
}
for (const theme of ['light', 'dark']) {
  if (theme === 'dark') {
    shots.push({
      feature: 'rules', theme, variant: 'tree-url',
      state: { view: 'rules', theme, sidebar: 'expanded', overlay: '', ruleList: 'tree-url' },
    });
  }
  shots.push({
    feature: 'agent-models', theme, variant: 'settings-provider-menu',
    interaction: 'provider-menu',
    state: { view: 'settings', theme, sidebar: 'expanded', overlay: '', settings: 'agent', agentProvider: 'unconfigured' },
  });
  for (const agentToolApprovalName of ['breakpoints_continue_queue', 'breakpoints_drop_queue', 'breakpoints_continue_rule']) {
    for (const agentToolApproval of ['pending', 'allowed']) {
      shots.push({
        feature: 'agent-models', theme, variant: `panel-${agentToolApprovalName}-${agentToolApproval}`,
        appSize: { width: 1600, height: 900 },
        state: {
          view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open',
          agentProvider: 'configured', agentChat: 'checkout', agentExecutionMode: 'ask',
          agentToolApprovalName, agentToolApproval, agentToolTrace: '',
        },
      });
    }
  }
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
  for (const stage of ['pending', 'allowed', 'canceled']) {
    shots.push({
      feature: 'agent-models', theme, variant: `panel-diagnostics-export-${stage}`,
      appSize: { width: 1600, height: 900 },
      state: {
        view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open',
        agentExecutionMode: 'ask', agentToolTrace: '', agentToolApprovalName: 'diagnostics_export',
        agentToolApproval: stage === 'pending' ? 'pending' : 'allowed', agentDiagnosticsExportStarted: stage !== 'canceled',
      },
    });
  }
  shots.push({
    feature: 'agent-models', theme, variant: 'panel-transfer-jobs', appSize: { width: 1600, height: 900 },
    state: {
      view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open',
      agentExecutionMode: 'ask', agentToolTrace: 'transfer-jobs', agentToolApproval: '',
    },
  });
  for (const format of ['har', 'archive']) {
    for (const direction of ['export', 'import']) {
      for (const stage of ['pending', 'allowed', 'canceled']) {
        shots.push({
          feature: 'agent-models', theme, variant: `panel-${format}-${direction}-${stage}`, appSize: { width: 1600, height: 900 },
          state: {
            view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open',
            agentExecutionMode: 'ask', agentToolTrace: '', agentToolApprovalName: `capture_${direction}_${format}`,
            agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
            agentHarExportStarted: stage !== 'canceled', agentHarImportStarted: stage !== 'canceled',
            agentArchiveExportStarted: stage !== 'canceled', agentArchiveImportStarted: stage !== 'canceled',
          },
        });
      }
    }
  }
  for (const stage of ['pending', 'allowed', 'canceled']) {
    shots.push({
      feature: 'agent-models', theme, variant: `panel-body-export-${stage}`, appSize: { width: 1600, height: 900 },
      state: {
        view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open',
        agentExecutionMode: 'ask', agentToolTrace: '', agentToolApprovalName: 'capture_export_body',
        agentToolApproval: stage === 'pending' ? 'pending' : 'allowed', agentBodyExportStarted: stage !== 'canceled',
      },
    });
  }
  for (const stage of ['pending', 'allowed']) {
    shots.push({
      feature: 'agent-models', theme, variant: `panel-transfer-cancel-${stage}`, appSize: { width: 1600, height: 900 },
      state: {
        view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open',
        agentExecutionMode: 'ask', agentToolTrace: '', agentToolApprovalName: 'capture_cancel_transfer_job', agentToolApproval: stage,
      },
    });
  }
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
    'settings_set_language', 'settings_set_theme', 'settings_set_export_privacy_defaults',
    'settings_generate_certificate', 'settings_install_certificate', 'settings_uninstall_certificate',
    'settings_delete_certificate', 'settings_reveal_certificate', 'settings_view_certificate', 'settings_open_certificate_manager',
    'settings_enable_app_container', 'settings_disable_app_container', 'settings_enable_all_app_containers', 'settings_disable_all_app_containers',
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
    variant: 'panel-collection-tools',
    appSize: { width: 1600, height: 900 },
    state: { view: 'composer', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', agentPanel: 'open', agentToolTrace: 'collection' },
  });
  for (const approval of ['pending', 'allowed']) {
    shots.push({
      feature: 'agent-models', theme,
      variant: `panel-collection-${approval}`,
      appSize: { width: 1600, height: 900 },
      state: {
        view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '',
        agentPanel: 'open', agentExecutionMode: 'ask', agentToolApproval: approval,
        agentToolApprovalName: 'composer_replace_collection',
      },
    });
  }
  for (const action of ['export', 'import']) {
    for (const stage of ['pending', 'allowed', 'canceled']) {
      shots.push({
        feature: 'agent-models', theme,
        variant: `panel-collection-${action}-${stage}`,
        appSize: { width: 1600, height: 900 },
        state: {
          view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '',
          agentPanel: 'open', agentExecutionMode: 'ask', agentToolTrace: '',
          agentToolApproval: stage === 'pending' ? 'pending' : 'allowed',
          agentToolApprovalName: `composer_${action}_collection`,
          agentCollectionExported: stage !== 'canceled', agentCollectionImported: stage !== 'canceled',
        },
      });
    }
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
  for (const storageState of ['ready', 'confirm', 'empty', 'unavailable']) {
    shots.push({ feature: 'settings', theme, variant: storageState === 'ready' ? 'storage' : `storage-${storageState}`,
      state: { view: 'settings', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', settings: 'storage', mitm: 'inactive',
        storageStatus: storageState === 'unavailable' ? 'unavailable' : 'ready', storageOperation: 'idle',
        storageCleared: storageState === 'empty', storageConfirming: storageState === 'confirm' } });
  }
  shots.push({ feature: 'settings', theme, variant: 'app-containers', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'app-containers', appContainers: 'ready' } });
  shots.push({ feature: 'settings', theme, variant: 'app-containers-refreshing', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'app-containers', appContainers: 'refreshing' } });
  shots.push({ feature: 'settings', theme, variant: 'app-container-confirm', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: 'app-container-confirm', settings: 'app-containers', appContainers: 'ready' } });
  shots.push({ feature: 'settings', theme, variant: 'app-container-enable-all', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: 'app-container-enable-all', settings: 'app-containers', appContainers: 'ready' } });
  shots.push({ feature: 'settings', theme, variant: 'app-container-disable-all', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: 'app-container-disable-all', settings: 'app-containers', appContainers: 'ready' } });
  shots.push({ feature: 'settings', theme, variant: 'tls-passthrough', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'tls-passthrough', tlsPassthrough: 'ready', tlsCompatibility: '' } });
  shots.push({ feature: 'settings', theme, variant: 'tls-passthrough-invalid', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'tls-passthrough', tlsPassthrough: 'invalid', tlsCompatibility: '', tlsHostInput: 'not a host' } });
  shots.push({ feature: 'settings', theme, variant: 'tls-passthrough-empty', state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'tls-passthrough', tlsPassthrough: 'empty', tlsCompatibility: '' } });
  for (const update of ['checking', 'available', 'downloading', 'downloaded', 'up-to-date', 'failed', 'unsupported']) {
    shots.push({ feature: 'settings', theme, variant: `updates-${update}`, state: { view: 'settings', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', settings: 'updates', update } });
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
  shots.push({ feature: 'capture', theme, variant: 'inspector-request-expanded', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'expanded', overlay: '', detail: 'open', tab: 'request' } });
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
  for (const messageState of ['loading', 'empty', 'error']) {
    shots.push({ feature: 'capture', theme, variant: `websocket-messages-${messageState}`, state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', detail: 'open', scene: 'websocket', tab: 'messages', breakpointState: '', websocketMessagesState: messageState } });
  }
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
  shots.push({ feature: 'composer', theme, variant: 'collection-folder-selected', state: base, interaction: 'composer-folder-selected' });
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
  shots.push({ feature: 'capture', theme, variant: 'statusbar-upstream-down', state: { view: 'capture', theme: TOKEN[theme], sidebar: 'collapsed', overlay: '', upstreamHealth: 'unreachable' } });
}
// Default shell: a dedicated global window header with feature tools inside content.
shots.push({ feature: 'capture', theme: 'dark', variant: 'inspector-sidebar-expanded', state: { view: 'capture', theme: 'dark', sidebar: 'expanded', overlay: '', detail: 'open', tab: 'headers' } });
shots.push({ feature: 'capture', theme: 'light', variant: 'inspector-sidebar-expanded', state: { view: 'capture', theme: 'light', sidebar: 'expanded', overlay: '', detail: 'open', tab: 'headers' } });
shots.push({ feature: 'capture', theme: 'light', variant: 'inspector-sidebar-collapsed', state: { view: 'capture', theme: 'light', sidebar: 'collapsed', overlay: '', detail: 'open', tab: 'headers' } });
shots.push({ feature: 'capture', theme: 'light', variant: 'rule-filter-auth', state: { view: 'capture', theme: 'light', sidebar: 'expanded', overlay: '', detail: 'open', tab: 'headers', ruleFilter: 'rule-auth' } });
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

for (const theme of ['warm', 'ember']) {
  for (const mcpServerState of ['disabled', 'running', 'conflict']) {
    shots.push({
      feature: 'agent-models',
      theme,
      variant: mcpServerState === 'disabled' ? 'settings-agent' : `settings-mcp-${mcpServerState}`,
      appSize: { width: 1600, height: 900 },
      state: {
        view: 'settings', theme, sidebar: 'expanded', overlay: '', settings: 'agent',
        agentProvider: 'configured', mcpServerState,
        mcpEndpointAssigned: mcpServerState !== 'disabled',
        mcpClientLabel: mcpServerState === 'disabled' ? '' : 'VS Code',
        mcpClientExecutionMode: 'ask',
      },
    });
  }
}

for (const theme of ['light', 'dark', 'warm', 'ember']) {
  for (const mode of ['system', 'direct', 'manual', 'pac', 'wpad']) {
    for (const surface of ['settings', 'quick']) {
      for (const phase of ['editing', 'applied']) {
        const config = { mode: 'system', protocol: 'http', host: '127.0.0.1', port: '7890', pacUrl: 'http://proxy.office.test/proxy.pac' };
        shots.push({
          feature: 'upstream', theme, variant: `${surface}-${mode}-${phase}`,
          state: {
            view: surface === 'settings' ? 'settings' : 'capture', theme, settings: 'upstream',
            sidebar: surface === 'settings' ? 'expanded' : 'collapsed', detail: 'open', tab: 'headers', mitm: 'inactive',
            upstreamPopoverOpen: surface === 'quick', upstreamConfig: phase === 'applied' ? { ...config, mode } : config,
            upstreamDraft: { ...config, mode }, upstreamOperation: 'idle', upstreamApplyRequested: false,
            upstreamApplyError: '', upstreamHealth: 'ready',
          },
        });
      }
    }
  }
}

for (const theme of ['light', 'dark', 'warm', 'ember']) {
  for (const surface of ['settings', 'quick']) {
    for (const state of ['discovering', 'failed', 'long-unreachable']) {
      const config = { mode: 'system', protocol: 'http', host: '127.0.0.1', port: '7890', pacUrl: 'http://proxy.office.test/proxy.pac' };
      const long = state === 'long-unreachable';
      shots.push({
        feature: 'upstream', theme,
        variant: long ? `${surface}-long-unreachable` : `${surface}-wpad-${state}`,
        state: {
          view: surface === 'settings' ? 'settings' : 'capture', theme, settings: 'upstream',
          sidebar: surface === 'settings' ? 'expanded' : 'collapsed', detail: 'open', tab: 'headers', mitm: 'inactive',
          upstreamPopoverOpen: surface === 'quick',
          upstreamConfig: long ? { ...config, mode: 'manual', host: 'proxy.gateway.department.example.test', port: '3128' } : config,
          upstreamDraft: { ...config, mode: long ? 'manual' : 'wpad' },
          upstreamOperation: state === 'discovering' ? 'discovering' : 'idle',
          upstreamApplyError: state === 'failed' ? 'discovery' : '', upstreamApplyRequested: false,
          upstreamHealth: long ? 'unreachable' : 'ready',
        },
      });
    }
  }
}

const STABILIZE = '*{caret-color:transparent!important}body:not(.menu-interaction-shot) *{transition:none!important;animation:none!important}.monaco-editor .cursors-layer{display:none!important}body.menu-interaction-shot{padding:0!important;align-items:flex-start!important;justify-content:flex-start!important}';
const FULL_CSS = `
.app{height:auto!important;min-height:900px!important}
.mainhost,.mv{overflow:visible!important}
.app[data-homepage-guide="open"] .hppRoot{position:relative!important;overflow:visible!important}
.app[data-homepage-guide="open"] .hppSidebar{position:static!important;max-height:none!important;overflow:visible!important}
.listwrap,.cfilters-scroll,.rlist,.reditor,.insp,.scroll,.edscroll,.ccol-scroll,.creq,.cresp,.cpane,.cscroll,.cedit,.jsonv,
.snav,.scontent,.break-inspector,.break-scroll,.dlist,.ddetail,.dscroll{overflow:visible!important;max-height:none!important}
`;

const selectedShots = shots.filter((shot) =>
  (!onlyFeature || shot.feature === onlyFeature) &&
  (!onlyVariant || onlyVariant.split(',').includes(shot.variant)) &&
  (!onlyTheme || shot.theme === onlyTheme),
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
let browser;
try {
browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1680, height: 1000 } });

async function prepareDesignPage() {
  await page.waitForFunction(() => window.__monacoReady === true, null, { timeout: 120_000 });
  await page.evaluate(async () => {
    const fonts = [
      ...[400, 450, 500, 600, 700].map(weight => `${weight} 12px "Inter"`),
      ...[400, 500, 600].map(weight => `${weight} 12px "JetBrains Mono"`),
    ];
    for (const font of fonts) {
      const faces = await document.fonts.load(font, 'Interceptor');
      if (faces.length === 0 || faces.some(face => face.status !== 'loaded')) {
        throw new Error(`Design font unavailable: ${font}`);
      }
    }
    window.__monacoRelayout?.();
    const controls = document.querySelector('.dock');
    if (controls) controls.style.display = 'none';
  });
  await page.addStyleTag({ content: STABILIZE });
  await page.waitForTimeout(250);
}

await page.goto(designPreview.url, { waitUntil: 'load', timeout: 120_000 });
await prepareDesignPage();

const app = page.locator('.app');
async function shoot(list) {
  let previousInteraction = '';
  for (const s of list) {
    if (
      s.interaction === 'breakpoint-queue-menu'
      || s.interaction === 'websocket-breakpoint-setup'
      || previousInteraction === 'rule-action-tags'
      || previousInteraction === 'provider-menu'
      || previousInteraction === 'grpc-text'
      || s.interaction?.startsWith('http-body-')
      || previousInteraction.startsWith('http-body-')
    ) {
      await page.reload({ waitUntil: 'load', timeout: 120_000 });
      await prepareDesignPage();
      if (s.full) await page.addStyleTag({ content: FULL_CSS });
    }
    await page.evaluate(() => window.__setState({
      homepageGuidePreview: false,
      homepageGuidePage: 'overview',
      overlay: '',
      upstreamPopoverOpen: false,
      upstreamOperation: 'idle',
      upstreamApplyRequested: false,
      upstreamApplyError: '',
      upstreamHealth: 'ready',
      upstreamConfig: { mode: 'system', protocol: 'http', host: '127.0.0.1', port: '7890', pacUrl: 'http://proxy.office.test/proxy.pac' },
      upstreamDraft: { mode: 'system', protocol: 'http', host: '127.0.0.1', port: '7890', pacUrl: 'http://proxy.office.test/proxy.pac' },
      fileMenu: '',
      requestMenu: '',
      breakpointState: '',
      breakpointQueueSelection: 'http-head',
      breakpointQueueMenu: '',
      breakpointPanel: '',
      breakpointMessage: '',
      websocketBreakpoint: 'disabled',
      websocketMessagesState: 'ready',
      grpcMessageSource: null,
      bodyRemainderSample: 'current',
      bodyRemainderNotice: 'none',
      pop: false,
      pop2: '',
      ctxmenu: '',
      agentPanel: 'closed',
      agentProviderDialog: '',
      agentRulesExported: true,
      agentRulesImported: true,
      agentCollectionExported: true,
      agentCollectionImported: true,
      agentDiagnosticsExportStarted: true,
      agentBodyExportStarted: true,
      agentHarExportStarted: true,
      agentHarImportStarted: true,
      agentArchiveExportStarted: true,
      agentArchiveImportStarted: true,
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
    await page.evaluate(({ interaction, modelMenuOpen }) => {
      document.body.classList.toggle(
        'menu-interaction-shot',
        interaction === 'breakpoint-menu'
          || interaction === 'breakpoint-queue-menu'
          || interaction === 'websocket-breakpoint-setup'
          || interaction === 'provider-menu'
          || modelMenuOpen,
      );
    }, { interaction: s.interaction, modelMenuOpen: s.state.agentModelMenu === 'open' });
    await page.evaluate((st) => window.__setState({
      overlay: '',
      fileMenu: '',
      settings: 'certificates',
      update: 'up-to-date',
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
      websocketMessagesState: 'ready',
      grpcMessageSource: null,
      bodyRemainderSample: 'current',
      bodyRemainderNotice: 'none',
      ruleTypography: 'composer',
      composer: '',
      collection: 'open',
      collectionRename: '',
      composerHistory: '',
      agentPanel: 'closed',
      agentProvider: 'configured',
      agentRulesExported: true,
      agentRulesImported: true,
      agentCollectionExported: true,
      agentCollectionImported: true,
      agentDiagnosticsExportStarted: true,
      agentBodyExportStarted: true,
      agentHarExportStarted: true,
      agentHarImportStarted: true,
      agentArchiveExportStarted: true,
      agentArchiveImportStarted: true,
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
    if (s.state.agentModelMenu === 'open') {
      await page.locator('[data-parity="agent-model-menu"]').waitFor({ state: 'visible' });
      await page.waitForTimeout(300);
    }
    if (s.interaction === 'breakpoint-queue-menu') {
      await page.getByRole('button', { name: 'Queue actions' }).click();
      await page.getByRole('menu', { name: 'Queue actions' }).waitFor();
    }
    if (s.interaction === 'provider-menu') {
      await page.getByRole('button', { name: 'Add provider', exact: true }).click();
      await page.getByRole('menu', { name: 'Provider types' }).waitFor();
      await page.waitForFunction(() => {
        const menu = document.querySelector('[role="menu"][aria-label="Provider types"]');
        if (!menu) return false;
        for (let element = menu; element; element = element.parentElement) {
          const style = getComputedStyle(element);
          if (style.opacity !== '1' || style.visibility !== 'visible' || style.display === 'none') return false;
        }
        return true;
      });
    }
    if (s.interaction === 'rule-action-tags') {
      await page.getByRole('button', { name: 'Show all 4 actions' }).hover();
      await page.getByRole('tooltip').waitFor();
    }
    if (s.interaction === 'composer-folder-selected') {
      await page.locator('.ccol [data-grp="github-repos"] > .cgrp-h .cgrp-namebtn').click();
      await page.mouse.move(0, 0);
    }
    if (s.interaction === 'grpc-text') {
      const textMode = page.getByRole('radiogroup', { name: 'Response message view' })
        .getByRole('radio', { name: 'Text', exact: true });
      await textMode.click();
      await page.waitForFunction(() => document.querySelector(
        '.grpcpayload [role="radio"][aria-checked="true"]',
      )?.textContent === 'Text');
      await page.mouse.move(0, 0);
    }
    let httpBodySource;
    if (s.interaction?.startsWith('http-body-')) {
      if (s.state.bodyRemainderNotice !== 'image-limit') {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.getByRole('button', { name: 'Copy body', exact: true }).click();
        httpBodySource = await page.evaluate(() => navigator.clipboard.readText());
      }
      if (s.interaction !== 'http-body-original') {
        await page.getByRole('button', { name: /^Original body/ }).click();
        await page.waitForTimeout(250);
        const mode = s.interaction === 'http-body-file' ? 'File' : 'Text';
        await page.getByRole('radiogroup', { name: 'Replacement body mode' })
          .getByRole('radio', { name: mode, exact: true }).click();
        if (mode === 'File') {
          await page.getByRole('button', { name: /^Choose file/ }).click();
        } else {
          if (httpBodySource === undefined) throw new Error('HTTP Text scene has no source');
          const input = page.getByRole('textbox', { name: 'Replacement body', exact: true });
          await input.fill(httpBodySource);
          await input.press('ControlOrMeta+End');
          await input.press('End');
          await input.press('ArrowRight');
          await input.pressSequentially('\ncomplete-text-kept-after-preview-end');
        }
      }
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);
    }
    if (s.resizeBodyDelta) {
      const body = page.locator('.grpcpayload [data-monaco]').filter({ visible: true });
      const box = await body.boundingBox();
      if (!box) throw new Error('The message body is not visible for resizing.');
      await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3 + s.resizeBodyDelta, { steps: 12 });
      await page.mouse.up();
      await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
    }
    if (
      s.interaction !== 'request-menu'
      && s.interaction !== 'breakpoint-menu'
      && s.interaction !== 'websocket-breakpoint-setup'
      && s.interaction !== 'breakpoint-queue-menu'
      && s.interaction !== 'provider-menu'
      && await page.locator('.ant-dropdown:visible').count() > 0
    ) {
      throw new Error(`Unexpected open Dropdown before ${s.theme}/${s.feature}/${s.variant}`);
    }
    // Monaco hosts inside a hidden tab measure as zero until the tab is visible.
    await page.evaluate(() => window.__monacoRelayout());
    await page.waitForTimeout(60);
    if (s.hover) await page.hover(s.hover);
    else if (!s.interaction) await page.mouse.move(0, 0);
    if (s.feature === 'upstream') {
      await page.waitForSelector('[data-design-upstream-popover]', {
        state: s.state.upstreamPopoverOpen ? 'visible' : 'detached',
      });
    }
    const dest = path.join(shotsRoot, s.theme, s.feature);
    await mkdir(dest, { recursive: true });
    const outputPath = path.join(dest, `${s.variant}.png`);
    if (
      s.interaction === 'request-menu'
      || s.interaction === 'breakpoint-menu'
      || s.interaction === 'websocket-breakpoint-setup'
      || s.interaction === 'breakpoint-queue-menu'
      || s.interaction === 'provider-menu'
      || s.state.agentModelMenu === 'open'
    ) {
      const clip = await app.boundingBox();
      if (!clip) throw new Error('Design app is not visible');
      await page.screenshot({ path: outputPath, clip });
    } else {
      await app.screenshot({ path: outputPath });
    }
    if (s.interaction?.startsWith('http-body-')) {
      const actual = await page.evaluate(() => {
        const host = [...document.querySelectorAll('[data-remainder-preview] [data-monaco]')]
          .find((element) => element.getClientRects().length > 0 && element.clientWidth > 0);
        const rect = host?.getBoundingClientRect();
        const input = [...document.querySelectorAll('textarea[aria-label="Replacement body"]')]
          .find((element) => element.getClientRects().length > 0 && element.clientWidth > 0);
        return {
          preview: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, resize: getComputedStyle(host).resize } : null,
          replacementMode: document.querySelector('[role="radiogroup"][aria-label="Replacement body mode"] [aria-checked="true"]')?.textContent,
          notice: document.querySelector('[data-remainder-preview="file"] [role="status"]')?.textContent
            ?? document.querySelector('[data-remainder-preview="original"] [role="status"]')?.textContent ?? null,
          inputValue: input instanceof HTMLTextAreaElement ? input.value : null,
        };
      });
      await writeFile(path.join(dest, `${s.variant}.json`), JSON.stringify({
        state: s.state, interaction: s.interaction, source: httpBodySource ?? null, actual,
      }, null, 2), 'utf8');
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

console.log(`\nDone — ${selectedShots.length} shots → ${shotsRoot}`);
} finally {
  await browser?.close();
  await designPreview.close();
}
