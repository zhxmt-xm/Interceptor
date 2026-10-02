import { describe, expect, it } from 'vitest';

import { LANGUAGE_IDS } from '../../languages';
import { mcpMessages } from '../../mcp-resources';

describe('MCP messages', () => {
  it('keeps every language aligned with the English MCP catalog', () => {
    const englishKeys = Object.keys(mcpMessages.en).sort();
    for (const language of LANGUAGE_IDS) {
      const catalog = mcpMessages[language];
      expect(Object.keys(catalog).sort(), language).toEqual(englishKeys);
      for (const value of Object.values(catalog)) {
        expect(value.trim().length, language).toBeGreaterThan(0);
      }
      if (language !== 'en') expect(catalog, language).not.toBe(mcpMessages.en);
    }
  });

  it('ships localized simplified Chinese for MCP connection and credential decisions', () => {
    expect(mcpMessages['zh-CN']['settings.mcp.title']).toBe('MCP Server');
    expect(mcpMessages['zh-CN']['settings.mcp.regenerateDescription'])
      .toContain('应用重启绝不会自动轮换');
    expect(mcpMessages['zh-CN']['mcp.approval.allow']).toBe('允许 Tool 调用');
  });

  it('lists all three MCP revisions in every localized protocol notice', () => {
    for (const language of LANGUAGE_IDS) {
      const message: unknown = Reflect.get(mcpMessages[language], 'settings.mcp.protocolSupport');
      for (const version of ['2025-06-18', '2025-11-25', '2026-07-28']) {
        expect(message, `${language}: ${version}`).toEqual(expect.stringContaining(version));
      }
    }
  });
});