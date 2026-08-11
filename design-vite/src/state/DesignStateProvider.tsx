import { useCallback, useEffect, useReducer, type PropsWithChildren } from 'react';

import { DesignStateContext } from './context';
import type { DesignStatePatch } from './types';
import { INITIAL_DESIGN_STATE, reduceDesignState } from './utils';

export function DesignStateProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [state, dispatch] = useReducer(reduceDesignState, INITIAL_DESIGN_STATE);
  const updateState = useCallback((patch: DesignStatePatch) => dispatch(patch), []);

  useEffect(() => {
    window.__setState = updateState;
    return () => {
      delete window.__setState;
    };
  }, [updateState]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  return <DesignStateContext value={{ state, updateState }}>{children}</DesignStateContext>;
}