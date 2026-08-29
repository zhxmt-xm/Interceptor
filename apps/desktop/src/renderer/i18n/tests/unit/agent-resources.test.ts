import { describe, expect, it } from 'vitest';

import { agentChatMessages } from '../../agent-chat-resources';
import { agentProviderMessages } from '../../agent-provider-resources';
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

  it('keeps every language aligned with the English Provider catalog', () => {
    const englishKeys = Object.keys(agentProviderMessages.en).sort();

    for (const language of LANGUAGE_IDS) {
      const catalog = agentProviderMessages[language];
      expect(Object.keys(catalog).sort(), language).toEqual(englishKeys);
      for (const value of Object.values(catalog)) {
        expect(value.trim().length, language).toBeGreaterThan(0);
      }
    }
  });

  it('ships localized simplified Chinese for Provider configuration', () => {
    expect(agentProviderMessages['zh-CN']['settings.agent.addProvider']).toBe('添加 Provider');
    expect(agentProviderMessages['zh-CN']['settings.agent.testConnection']).toBe('测试连接');
  });

  it('keeps every language aligned with the English Chat catalog', () => {
    const englishKeys = Object.keys(agentChatMessages.en).sort();
    for (const language of LANGUAGE_IDS) {
      expect(Object.keys(agentChatMessages[language]).sort(), language).toEqual(englishKeys);
      if (language !== 'en') {
        expect(agentChatMessages[language], language).not.toBe(agentChatMessages.en);
      }
    }
  });

  it('ships localized simplified Chinese for persistent Chat', () => {
    expect(agentChatMessages['zh-CN']['agent.sendMessage']).toBe('发送消息');
    expect(agentChatMessages['zh-CN']['agent.sessionUsage']).toBe('对话用量');
  });
});