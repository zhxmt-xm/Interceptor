import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_IPC_CHANNELS,
  CoreProcessStatus,
  InterceptorDesktopApi,
  type CaptureExchangeEvent,
} from '../shared/desktop-api';

const api: InterceptorDesktopApi = {
  echoCore: (value) => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreEcho, value),
  getCoreProcessStatus: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreGetProcessStatus),
  getCoreTrace: (traceId) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.coreGetTrace, traceId),
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
  readBody: (bodyId, offset, length) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.bodyReadRange, bodyId, offset, length),
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
  getInsecureHosts: () =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.httpsGetInsecureHosts),
  setInsecureHosts: (hosts) =>
    ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.httpsSetInsecureHosts, hosts),
};

contextBridge.exposeInMainWorld('interceptor', api);