import { create } from 'zustand';

/** Startup steps that must complete before traffic can reach the proxy. */
export const BOOT_STEPS = ['core', 'listener', 'proxy'] as const;

export type BootStep = (typeof BOOT_STEPS)[number];
export type BootPhase = BootStep | 'ready' | 'error';
export type BootStepState = 'pending' | 'active' | 'done' | 'failed';

interface BootState {
  phase: BootPhase;
  /** Step that failed, so the dots can show where startup stopped. */
  failedStep: BootStep | null;
  /** Failure detail shown in place of the current action line. */
  detail: string | null;
  /** Once dismissed the screen never returns; later Core restarts use the readiness dialog. */
  dismissed: boolean;
  advance: (phase: BootStep) => void;
  finish: () => void;
  fail: (detail: string) => void;
  restart: () => void;
  dismiss: () => void;
}

export const useBootStore = create<BootState>((set) => ({
  phase: 'core',
  failedStep: null,
  detail: null,
  dismissed: false,

  advance: (phase) => set((state) => (state.dismissed ? state : { phase, detail: null })),

  finish: () => set((state) => (state.dismissed ? state : { phase: 'ready', detail: null })),

  fail: (detail) => set((state) => (state.dismissed
    ? state
    : {
      phase: 'error',
      failedStep: state.phase === 'error' ? state.failedStep : toStep(state.phase),
      detail,
    })),

  restart: () => set({ phase: 'core', failedStep: null, detail: null }),

  dismiss: () => set({ dismissed: true }),
}));

/** Ready and error are not steps; anything non-step failed while finishing the last one. */
function toStep(phase: BootPhase): BootStep {
  return BOOT_STEPS.includes(phase as BootStep) ? (phase as BootStep) : 'proxy';
}

/** Dot state for one step under the current phase. */
export function bootStepState(
  step: BootStep,
  phase: BootPhase,
  failedStep: BootStep | null,
): BootStepState {
  if (phase === 'ready') {
    return 'done';
  }
  const index = BOOT_STEPS.indexOf(step);
  if (phase === 'error') {
    const failedIndex = BOOT_STEPS.indexOf(failedStep ?? 'core');
    if (index === failedIndex) {
      return 'failed';
    }
    return index < failedIndex ? 'done' : 'pending';
  }
  const currentIndex = BOOT_STEPS.indexOf(phase);
  if (index === currentIndex) {
    return 'active';
  }
  return index < currentIndex ? 'done' : 'pending';
}
