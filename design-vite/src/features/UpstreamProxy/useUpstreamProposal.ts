import { useEffect } from 'react';

import { useDesignState } from '../../state/useDesignState';
import { normalizeUpstreamDraft } from './utils';

/** Simulate an Apply only after a design interaction, not when displaying a static busy scene. */
export function useUpstreamProposal(): void {
  const { state, updateState } = useDesignState();
  useEffect(() => {
    if (!state.upstreamApplyRequested) return undefined;
    const draft = normalizeUpstreamDraft(state.upstreamDraft);
    const timer = window.setTimeout(() => {
      if (state.upstreamFixtureOutcome === 'failure') {
        updateState({
          upstreamApplyRequested: false, upstreamOperation: 'idle',
          upstreamApplyError: draft.mode === 'wpad' ? 'discovery' : 'connection',
        });
      } else {
        updateState({
          upstreamConfig: draft, upstreamDraft: draft, upstreamApplyRequested: false,
          upstreamOperation: 'idle', upstreamApplyError: '', upstreamHealth: 'ready',
        });
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state.upstreamApplyRequested, state.upstreamDraft, state.upstreamFixtureOutcome, updateState]);
}
