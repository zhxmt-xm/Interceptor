import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_IPC_CHANNELS,
  CoreProcessStatus,
  InterceptorDesktopApi,
  type CaptureExchangeEvent,
  type UpdateStatus,
} from '../shared/desktop-api';

const api: InterceptorDesktopApi = {
  closeApplication: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appQuit),
  minimizeWindow: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowMinimize),
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowToggleMaximize),
  setUiLanguage: (language) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.uiSetLanguage, language),
  echoCore: (value) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreEcho, value),
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
  repairSystemProxy: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.systemProxyRepair),
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
  onWindowChromePress: (listener) => {
    const handler = (): void => {
      listener();
    };
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.windowChromePress, handler);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_CHANNELS.windowChromePress, handler);
    };
  },
  getStorageStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.storageGetStatus),
  clearStorage: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.storageClear),
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
  getRules: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rulesGet),
  validateRules: (rules) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rulesValidate, rules),
  replaceRules: (expectedRevision, rules) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rulesReplace, expectedRevision, rules),
  getRuleHits: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.rulesHits),
  sendComposerRequest: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.composerSend, request),
  listBreakpoints: () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointList),
  resolveBreakpoint: (breakpointId, action, edit) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointResolve, breakpointId, action, edit),
  setBreakpointsEnabled: (enabled) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.breakpointConfigure, enabled),
  probeConnection: (host, port) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.connectionProbe, host, port),
  startHarExport: (request) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.harExportStart, request),
  startHarImport: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.harImportStart),
  startArchiveExport: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.archiveExportStart),
  startArchiveImport: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.archiveImportStart),
  startDiagnosticsExport: (filter) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.diagnosticsExportStart, filter),
  getTransferJob: (jobId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.transferJobGet, jobId),
  cancelTransferJob: (jobId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.transferJobCancel, jobId),
};

contextBridge.exposeInMainWorld('interceptor', api);