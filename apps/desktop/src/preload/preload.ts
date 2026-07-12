import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_IPC_CHANNELS,
  CoreProcessStatus,
  InterceptorDesktopApi,
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
};

contextBridge.exposeInMainWorld('interceptor', api);