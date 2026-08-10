import { createContext } from 'react';

import type { DesignState, UpdateDesignState } from './types';

export interface DesignStateContextValue {
  readonly state: DesignState;
  readonly updateState: UpdateDesignState;
}

export const DesignStateContext = createContext<DesignStateContextValue | undefined>(undefined);