import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_IPC_CHANNELS,
  CoreProcessStatus,
  type GitHubAuthStatus,
  InterceptorDesktopApi,
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
  querySessions: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.sessionsQuery, request),
  getExchangeDetail: (exchangeId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.sessionsDetail, exchangeId),
  queryWebSocketFrames: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.websocketFrames, request),
  setWebSocketBreakpointsEnabled: (enabled) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.websocketBreakpointConfigure, enabled),
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
  sendComposerRequest: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.composerSend, request),
  listBreakpoints: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointList),
  resolveBreakpoint: (breakpointId, action, edit) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointResolve, breakpointId, action, edit),
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