import type { InterceptorDesktopApi } from '../shared/desktop-api';

declare global {
  interface Window {
    interceptor: InterceptorDesktopApi;
  }
}

export {};