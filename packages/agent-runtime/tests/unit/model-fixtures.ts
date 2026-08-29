import type { ModelCapabilities } from '../../src';

export const TEST_MODEL_CAPABILITIES: ModelCapabilities = {
  contextWindowTokens: 1_000,
  maxOutputTokens: 100,
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsReasoningContent: true,
  supportsCacheUsage: true,
};