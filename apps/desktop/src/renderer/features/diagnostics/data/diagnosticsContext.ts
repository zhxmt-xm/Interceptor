import { createContext, useContext } from 'react';

import type { DiagnosticsContextValue } from '../interfaces';

/** Provider 与读取方之间的上下文。 */
export const DiagnosticsContext = createContext<DiagnosticsContextValue | null>(
  null,
);

/** 读取 Diagnostics 上下文；未包在 Provider 内时直接失败而不是静默返回空。 */
export function useDiagnostics(): DiagnosticsContextValue {
  const value = useContext(DiagnosticsContext);
  if (!value) {
    throw new Error('useDiagnostics must be used within a DiagnosticsProvider');
  }
  return value;
}
