import { describe, expect, it } from 'vitest';

import { githubAuthMessages } from '../../github-auth-resources';
import { LANGUAGE_IDS } from '../../languages';

describe('GitHub authorization messages', () => {
  it('keeps every language aligned with the English authorization catalog', () => {
    const englishKeys = Object.keys(githubAuthMessages.en).sort();

    for (const language of LANGUAGE_IDS) {
      const catalog = githubAuthMessages[language];
      expect(Object.keys(catalog).sort(), language).toEqual(englishKeys);
      for (const value of Object.values(catalog)) {
        expect(value.trim().length, language).toBeGreaterThan(0);
      }
    }
  });

  it('ships localized private-release guidance for simplified Chinese', () => {
    expect(githubAuthMessages['zh-CN']['settings.signInWithGitHub'])
      .toBe('使用 GitHub 登录');
    expect(githubAuthMessages['zh-CN']['settings.repositoryAccessHint'])
      .toContain('GitHub App');
  });
});
