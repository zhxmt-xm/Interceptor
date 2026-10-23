import { describe, expect, it } from 'vitest';

import {
  createGuidebookOpenSearchMessage,
  createGuidebookSyncMessage,
  guidebookUrl,
  readGuidebookLocationMessage,
} from '../../utils';

describe('Guidebook desktop bridge', () => {
  it('uses the embedded Chinese guide only for Simplified Chinese', () => {
    expect(guidebookUrl('zh-CN')).toBe('https://www.interceptor.cn/guide?embed=desktop');
    expect(guidebookUrl('en')).toBe('https://www.interceptor.cn/en/guide?embed=desktop');
    expect(guidebookUrl('zh-TW')).toBe('https://www.interceptor.cn/en/guide?embed=desktop');
    expect(guidebookUrl('ja')).toBe('https://www.interceptor.cn/en/guide?embed=desktop');
  });

  it('creates the narrow preference and search messages accepted by the website', () => {
    expect(createGuidebookSyncMessage('dark', 'zh-CN')).toEqual({
      source: 'interceptor-desktop-guidebook',
      type: 'sync-preferences',
      theme: 'dark',
      locale: 'zh-CN',
    });
    expect(createGuidebookSyncMessage('warm', 'de')).toEqual({
      source: 'interceptor-desktop-guidebook',
      type: 'sync-preferences',
      theme: 'warm',
      locale: 'en',
    });
    expect(createGuidebookOpenSearchMessage()).toEqual({
      source: 'interceptor-desktop-guidebook',
      type: 'open-search',
    });
  });

  it('accepts only embedded locations from the canonical Guidebook origin', () => {
    const message = {
      source: 'interceptor-guidebook',
      type: 'location-changed',
      url: 'https://www.interceptor.cn/en/guide/capture?embed=desktop#requests',
    };
    expect(readGuidebookLocationMessage(message)).toBe(message.url);
    expect(readGuidebookLocationMessage({
      ...message,
      url: 'https://interceptor.cn/en/guide/capture?embed=desktop',
    })).toBeNull();
    expect(readGuidebookLocationMessage({
      ...message,
      url: 'https://www.interceptor.cn/en/guide/capture',
    })).toBeNull();
    expect(readGuidebookLocationMessage({
      ...message,
      type: 'open-search',
    })).toBeNull();
  });
});
