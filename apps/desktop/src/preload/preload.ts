import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_IPC_CHANNELS,
  CoreProcessStatus,
  type AgentRuntimeEvent,
  type CaptureReset,
  type CaptureStatus,
  type GitHubAuthStatus,
  InterceptorDesktopApi,
  type McpApprovalRequest,
  type McpDesktopStatus,
  type CaptureExchangeEvent,
  type ClientAppIcon,
  type SystemProxyStatus,
  type TlsCompatibilityEvent,
  type UpdateStatus,
} from '../shared/desktop-api';

const api: InterceptorDesktopApi = {
  echoCore: (value) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreEcho, value),
  closeApplication: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appQuit),
  minimizeWindow: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowMinimize),
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowToggleMaximize),
  getCoreProcessStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreGetProcessStatus),
  getCoreTrace: (traceId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreGetTrace, traceId),
  getRecentDiagnostics: (limit) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreGetDiagnostics, limit),
  queryDiagnostics: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreQueryDiagnostics, request),
  reportRendererDiagnostic: (report) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rendererDiagnosticReport, report),
  getSystemProxyStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.systemProxyGetStatus),
  enableSystemProxy: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.systemProxyEnable),
  restoreSystemProxy: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.systemProxyRestore),
  listAppContainers: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appContainerList),
  setAppContainerLoopbackExemption: (appContainerSid, enabled) =>
    ipcRenderer.invoke(
      DESKTOP_IPC_CHANNELS.appContainerSetExemption,
      appContainerSid,
      enabled,
    ),
  enableAllAppContainers: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appContainerEnableAll),
  disableAllAppContainers: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appContainerDisableAll),
  getAgentModels: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentModelsGet),
  testAgentProviderConnection: (draft) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentProviderTest, draft),
  saveVerifiedAgentProvider: (verificationId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentProviderSaveVerified, verificationId),
  removeAgentProvider: (providerId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentProviderRemove, providerId),
  setDefaultAgentModel: (providerId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentModelSetDefault, providerId),
  getToolCapabilitySettings: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.toolCapabilitySettingsGet),
  disableAgentTool: (toolName) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentToolDisable, toolName),
  enableAgentTool: (toolName) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentToolEnable, toolName),
  disableMcpTool: (toolName) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpToolDisable, toolName),
  enableMcpTool: (toolName) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpToolEnable, toolName),
  getMcpStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpStatusGet),
  enableMcpServer: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpServerEnable),
  disableMcpServer: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpServerDisable),
  changeMcpEndpoint: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpEndpointChange),
  createMcpClient: (label) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpClientCreate, label),
  regenerateMcpClientCredential: (clientId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpClientCredentialRegenerate, clientId),
  revokeMcpClient: (clientId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpClientRevoke, clientId),
  requireMcpClientApproval: (clientId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpClientRequireApproval, clientId),
  automaticallyExecuteMcpClientTools: (clientId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpClientAutomaticallyExecuteTools, clientId),
  copyMcpClientConfiguration: (clientId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpClientConfigurationCopy, clientId),
  allowMcpToolCall: (approvalId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpToolCallAllow, approvalId),
  denyMcpToolCall: (approvalId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.mcpToolCallDeny, approvalId),
  onMcpStatusChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: McpDesktopStatus,
    ) => {
      listener(status);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.mcpStatus, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.mcpStatus, handler);
    };
  },
  onMcpApprovalRequest: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: McpApprovalRequest,
    ) => {
      listener(request);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.mcpApprovalRequest, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.mcpApprovalRequest, handler);
    };
  },
  onMcpApprovalSettled: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      approvalId: string,
    ) => {
      listener(approvalId);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.mcpApprovalSettled, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.mcpApprovalSettled, handler);
    };
  },
  listAgentSessions: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionsList),
  createAgentSession: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionCreate),
  selectAgentSession: (sessionId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionSelect, sessionId),
  getAgentSession: (sessionId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionGet, sessionId),
  renameAgentSession: (sessionId, title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionRename, sessionId, title),
  deleteAgentSession: (sessionId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionDelete, sessionId),
  setAgentSessionModel: (sessionId, providerId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionSetModel, sessionId, providerId),
  requireAgentToolApproval: (sessionId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionRequireToolApproval, sessionId),
  automaticallyExecuteAgentTools: (sessionId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentSessionAutomaticallyExecuteTools, sessionId),
  sendAgentMessage: (sessionId, content) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentMessageSend, sessionId, content),
  cancelAgentTurn: (turnId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentTurnCancel, turnId),
  retryAgentTurn: (turnId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentTurnRetry, turnId),
  allowAgentToolCall: (approvalId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentToolCallAllow, approvalId),
  denyAgentToolCall: (approvalId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentToolCallDeny, approvalId),
  onAgentSessionEvent: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      agentRuntimeEvent: AgentRuntimeEvent,
    ) => {
      listener(agentRuntimeEvent);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.agentSessionEvent, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.agentSessionEvent, handler);
    };
  },
  getGitHubAuthStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.githubAuthGetStatus),
  signInWithGitHub: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.githubAuthSignIn),
  openGitHubAuthorization: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.githubAuthOpenAuthorization),
  signOutFromGitHub: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.githubAuthSignOut),
  onGitHubAuthStatusChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: GitHubAuthStatus,
    ) => {
      listener(status);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.githubAuthStatus, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.githubAuthStatus, handler);
    };
  },
  getUpdateStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.updateGetStatus),
  checkForUpdates: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.updateCheck),
  downloadUpdate: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.updateDownload),
  openDownloadedUpdate: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.updateOpenDownloaded),
  onUpdateStatusChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: UpdateStatus,
    ) => {
      listener(status);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.updateStatus, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.updateStatus, handler);
    };
  },
  onCoreProcessStatusChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: CoreProcessStatus,
    ) => {
      listener(status);
    };

    ipcRenderer.on(DESKTOP_IPC_CHANNELS.coreProcessStatus, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.coreProcessStatus, handler);
    };
  },
  onSystemProxyStatusChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: SystemProxyStatus,
    ) => {
      listener(status);
    };

    ipcRenderer.on(DESKTOP_IPC_CHANNELS.systemProxyStatus, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.systemProxyStatus, handler);
    };
  },
  getCaptureUsage: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.captureGetUsage),
  clearCapture: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.captureClear),
  startCapture: (port) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.captureStart, port),
  stopCapture: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.captureStop),
  getCaptureStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.captureGetStatus),
  onCaptureStatusChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: CaptureStatus) => {
      listener(status);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.captureStatus, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.captureStatus, handler);
    };
  },
  onCaptureReset: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, reset: CaptureReset) => {
      listener(reset);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.captureReset, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.captureReset, handler);
    };
  },
  querySessions: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.sessionsQuery, request),
  getExchangeDetail: (exchangeId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.sessionsDetail, exchangeId),
  queryWebSocketFrames: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.websocketFrames, request),
  enableWebSocketBreakpoints: (settings) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.websocketBreakpointEnable, settings),
  disableWebSocketBreakpoints: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.websocketBreakpointDisable),
  queryGrpcMessages: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.grpcMessages, request),
  readBody: (bodyId, offset, length, options) =>
    ipcRenderer.invoke(
      DESKTOP_IPC_CHANNELS.bodyReadRange,
      bodyId,
      offset,
      length,
      options,
    ),
  startBodyExport: (request, title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.bodyExportStart, request, title),
  onCaptureEvents: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      events: CaptureExchangeEvent[],
    ) => {
      listener(events);
    };

    ipcRenderer.on(DESKTOP_IPC_CHANNELS.captureEvents, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.captureEvents, handler);
    };
  },
  onClientAppIcons: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      icons: ClientAppIcon[],
    ) => {
      listener(icons);
    };

    ipcRenderer.on(DESKTOP_IPC_CHANNELS.clientAppIcons, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.clientAppIcons, handler);
    };
  },
  getCertificateStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.caStatus),
  generateCertificate: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.caGenerate),
  installCertificate: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.caInstall),
  uninstallCertificate: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.caUninstall),
  deleteCertificate: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.caDelete),
  revealCertificate: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.caReveal),
  viewCertificate: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.caView),
  openCertificateManager: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.caOpenManager),
  getInsecureHosts: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.httpsGetInsecureHosts),
  setInsecureHosts: (hosts) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.httpsSetInsecureHosts, hosts),
  setHttpsDecryption: (enabled) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.httpsSetDecryption, enabled),
  getTlsPassthroughSettings: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.tlsPassthroughGet),
  replaceTlsPassthroughSettings: (expectedRevision, hosts) =>
    ipcRenderer.invoke(
      DESKTOP_IPC_CHANNELS.tlsPassthroughReplace,
      expectedRevision,
      hosts,
    ),
  onTlsCompatibilityChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      tlsCompatibilityEvent: TlsCompatibilityEvent,
    ) => {
      listener(tlsCompatibilityEvent);
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.tlsCompatibility, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.tlsCompatibility, handler);
    };
  },
  onBreakpointsChange: (listener) => {
    const handler = (): void => listener();
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.breakpointsChanged, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.breakpointsChanged, handler);
    };
  },
  getRules: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rulesGet),
  replaceRules: (expectedRevision, nodes) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rulesReplace, expectedRevision, nodes),
  getRuleHits: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rulesHits),
  getCollection: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.collectionGet),
  replaceCollection: (expectedRevision, nodes) =>
    ipcRenderer.invoke(
      DESKTOP_IPC_CHANNELS.collectionReplace,
      expectedRevision,
      nodes,
    ),
  exportCollection: (nodes, title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.collectionExport, nodes, title),
  exportRules: (nodes, title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rulesExport, nodes, title),
  readImportFile: (title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.importFileRead, title),
  sendComposerRequest: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.composerSend, request),
  listBreakpoints: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointList),
  pickBreakpointBodyFile: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointPickBodyFile),
  resolveBreakpoint: (breakpointId, action, edit) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointResolve, breakpointId, action, edit),
  continueBreakpointQueue: (queueKey) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointContinueQueue, queueKey),
  dropBreakpointQueue: (queueKey) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointDropQueue, queueKey),
  continueBreakpointRule: (ruleId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointContinueRule, ruleId),
  setBreakpointsEnabled: (enabled) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointConfigure, enabled),
  probeTls: (host, port) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.tlsProbe, host, port),
  startHarExport: (request, title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.harExportStart, request, title),
  startHarImport: (title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.harImportStart, title),
  startArchiveExport: (title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.archiveExportStart, title),
  startArchiveImport: (title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.archiveImportStart, title),
  startDiagnosticsExport: (filter, title) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.diagnosticsExportStart, filter, title),
  getTransferJob: (jobId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.transferJobGet, jobId),
  cancelTransferJob: (jobId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.transferJobCancel, jobId),
};

contextBridge.exposeInMainWorld('interceptor', api);