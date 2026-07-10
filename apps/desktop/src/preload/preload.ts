import { contextBridge, ipcRenderer } from 'electron';

import type {
  CoreStatus,
  InterceptorDesktopApi,
} from '../shared/desktop-api';

const CORE_STATUS_CHANNEL = 'core:status';
const CORE_GET_STATUS_CHANNEL = 'core:get-status';

const api: InterceptorDesktopApi = {
  getCoreStatus: () => ipcRenderer.invoke(CORE_GET_STATUS_CHANNEL),
  onCoreStatusChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: CoreStatus) => {
      listener(status);
    };

    ipcRenderer.on(CORE_STATUS_CHANNEL, handler);
    return () => ipcRenderer.removeListener(CORE_STATUS_CHANNEL, handler);
  },
};

contextBridge.exposeInMainWorld('interceptor', api);