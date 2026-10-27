import { describe, expect, it } from 'vitest';

import {
  isBlockedPackagedShortcut,
  isDevToolsShortcut,
  isReloadShortcut,
  type KeyboardInput,
} from '../../keyboard-guard';

function input(overrides: Partial<KeyboardInput>): KeyboardInput {
  return {
    type: 'keyDown',
    key: '',
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...overrides,
  };
}

describe('keyboard guard', () => {
  it('blocks every reload shortcut', () => {
    expect(isReloadShortcut(input({ key: 'F5' }))).toBe(true);
    expect(isReloadShortcut(input({ key: 'r', control: true }))).toBe(true);
    expect(isReloadShortcut(input({ key: 'R', meta: true }))).toBe(true);
    expect(isReloadShortcut(input({ key: 'r', control: true, shift: true }))).toBe(true);
    expect(isReloadShortcut(input({ key: 'r', meta: true, shift: true }))).toBe(true);
  });

  it('does not block unrelated keys or key-up events', () => {
    expect(isReloadShortcut(input({ key: 'r' }))).toBe(false);
    expect(isReloadShortcut(input({ key: 'F5', type: 'keyUp' }))).toBe(false);
    expect(isReloadShortcut(input({ key: 'F5', control: true }))).toBe(true);
    expect(isReloadShortcut(input({ key: 'w', control: true }))).toBe(false);
  });

  it('blocks DevTools shortcuts that can reach Reload from the console', () => {
    expect(isDevToolsShortcut(input({ key: 'F12' }))).toBe(true);
    expect(isDevToolsShortcut(input({ key: 'i', control: true, shift: true }))).toBe(true);
    expect(isDevToolsShortcut(input({ key: 'j', control: true, shift: true }))).toBe(true);
    expect(isDevToolsShortcut(input({ key: 'i', meta: true, alt: true }))).toBe(true);
    expect(isDevToolsShortcut(input({ key: 'j', meta: true, alt: true }))).toBe(true);
    expect(isDevToolsShortcut(input({ key: 'i', control: true }))).toBe(false);
  });

  it('combines refresh and DevTools guards', () => {
    expect(isBlockedPackagedShortcut(input({ key: 'F5' }))).toBe(true);
    expect(isBlockedPackagedShortcut(input({ key: 'i', control: true, shift: true }))).toBe(true);
    expect(isBlockedPackagedShortcut(input({ key: 'Escape' }))).toBe(false);
  });
});
