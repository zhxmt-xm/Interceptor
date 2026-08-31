import type { AgentTool, AgentToolSource, ModelCapabilities } from '../../src';

export const TEST_MODEL_CAPABILITIES: ModelCapabilities = {
  contextWindowTokens: 1_000,
  maxOutputTokens: 100,
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsReasoningContent: true,
  supportsCacheUsage: true,
};

/** Supplies one stable Tool set to tests that do not exercise dynamic authorization. */
export function staticToolSource(tools: readonly AgentTool[] = []): AgentToolSource {
  return {
    snapshot: () => ({ systemMessages: [], tools }),
  };
}