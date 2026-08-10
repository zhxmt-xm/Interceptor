import { use } from 'react';

import { DesignStateContext, type DesignStateContextValue } from './context';

export function useDesignState(): DesignStateContextValue {
  const context = use(DesignStateContext);
  if (!context) throw new Error('useDesignState must be used inside DesignStateProvider');
  return context;
}