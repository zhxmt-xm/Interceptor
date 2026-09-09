import { describe, expect, it } from 'vitest';

import { agentChatMessages } from '../../agent-chat-resources';
import { agentExecutionMessages } from '../../agent-execution-resources';
import { agentProviderMessages } from '../../agent-provider-resources';
import { agentMessages } from '../../agent-resources';
import { agentToolMessages } from '../../agent-tool-resources';
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

  it('keeps every language aligned with the English Tool settings catalog', () => {
    const englishKeys = Object.keys(agentToolMessages.en).sort();
    for (const language of LANGUAGE_IDS) {
      expect(Object.keys(agentToolMessages[language]).sort(), language).toEqual(englishKeys);
      if (language !== 'en') {
        expect(agentToolMessages[language], language).not.toBe(agentToolMessages.en);
      }
    }
  });

  it('ships localized simplified Chinese for Tool capability settings', () => {
    expect(agentToolMessages['zh-CN']['settings.agent.tools.title']).toBe('Tool 能力');
    expect(agentToolMessages['zh-CN']['settings.agent.tools.noMatches']).toBe('没有匹配的能力');
    expect(agentToolMessages['zh-CN']['agent.tools.activity']).toBe('Tool 活动');
    expect(agentToolMessages['zh-CN']['agent.tools.noParameters']).toBe('无参数');
  });

  it.each(['folder', 'viewer'])('localizes the certificate %s request in every language', (target) => {
    const key = `agent.tools.certificateWindow.${target}`;
    for (const language of LANGUAGE_IDS) {
      const catalog: Readonly<Record<string, string>> = agentToolMessages[language];
      expect(catalog[key], language).toEqual(expect.any(String));
      expect(catalog[key]?.trim().length, language).toBeGreaterThan(0);
    }
  });

  it('keeps every language aligned with the Agent execution catalog', () => {
    const englishKeys = Object.keys(agentExecutionMessages.en).sort();
    for (const language of LANGUAGE_IDS) {
      expect(Object.keys(agentExecutionMessages[language]).sort(), language).toEqual(englishKeys);
      if (language !== 'en') {
        expect(agentExecutionMessages[language], language).not.toBe(agentExecutionMessages.en);
      }
    }
  });

  it('ships localized simplified Chinese for Tool execution decisions', () => {
    expect(agentExecutionMessages['zh-CN']['agent.executionAsk']).toBe('询问');
    expect(agentExecutionMessages['zh-CN']['agent.allowTool']).toBe('允许 Tool');
  });
});