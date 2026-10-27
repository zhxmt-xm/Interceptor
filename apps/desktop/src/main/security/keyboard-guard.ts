export interface KeyboardInput {
  readonly type: string;
  readonly key: string;
  readonly control: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

/** Reload shortcuts that must not restart the packaged Renderer. */
export function isReloadShortcut(input: KeyboardInput): boolean {
  if (input.type !== 'keyDown') return false;
  const key = input.key.toLowerCase();
  if (key === 'f5') return true;
  return (input.control || input.meta) && key === 'r';
}

/** DevTools shortcuts that could reach Reload from the console. */
export function isDevToolsShortcut(input: KeyboardInput): boolean {
  if (input.type !== 'keyDown') return false;
  const key = input.key.toLowerCase();
  if (key === 'f12') return true;
  if ((input.control || input.meta) && input.shift && (key === 'i' || key === 'j')) return true;
  return input.meta && input.alt && (key === 'i' || key === 'j');
}

/** Packaged App blocks refresh and DevTools; development keeps both. */
export function isBlockedPackagedShortcut(input: KeyboardInput): boolean {
  return isReloadShortcut(input) || isDevToolsShortcut(input);
}
