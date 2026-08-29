import { describe, expect, it } from 'vitest';

import { agentMessages } from '../../agent-resources';
import { LANGUAGE_IDS } from '../../languages';

describe('Agent messages', () => {
  it('keeps every language aligned with the English Agent catalog', () => {
    const englishKeys = Object.keys(agentMessages.en).sort();

    for (const language of LANGUAGE_IDS) {
      const catalog = agentMessages[language];
      expect(Object.keys(catalog).sort(), language).toEqual(englishKeys);
      for (const value of Object.values(catalog)) {
        expect(value.trim().length, language).toBeGreaterThan(0);
      }
    }
  });

  it('ships localized simplified Chinese for the first Agent flow', () => {
    expect(agentMessages['zh-CN']['agent.open']).toBe('打开 Agent');
    expect(agentMessages['zh-CN']['agent.connectTitle']).toBe('连接模型以开始使用');
    expect(agentMessages['zh-CN']['settings.agent.emptyTitle']).toBe('尚未配置模型');
  });
});