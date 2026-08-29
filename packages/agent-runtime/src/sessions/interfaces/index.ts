import type {
  AgentContextUsage,
  AgentTurnStatus,
  ModelUsage,
} from '../../interfaces';

export interface StoredAgentUserItem {
  kind: 'user-message';
  itemId: string;
  turnId: string;
  content: string;
  createdAt: number;
}

export interface StoredAgentAssistantItem {
  kind: 'assistant-message';
  itemId: string;
  turnId: string;
  content: string;
  reasoningContent: string;
  partial: boolean;
  createdAt: number;
}

export type StoredAgentTranscriptItem = StoredAgentUserItem | StoredAgentAssistantItem;

export interface StoredAgentTurn {
  turnId: string;
  userItemId: string;
  assistantItemId: string;
  status: AgentTurnStatus;
  retryOfTurnId: string | null;
  error: { code: string; message: string } | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredAgentModelCall {
  readonly modelCallId: string;
  readonly turnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly usage: ModelUsage;
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
  readonly createdAt: number;
}

export interface StoredAgentSession {
  readonly version: 1;
  readonly sessionId: string;
  title: string;
  providerId: string;
  modelId: string;
  readonly createdAt: number;
  updatedAt: number;
  sequence: number;
  readonly items: StoredAgentTranscriptItem[];
  readonly turns: StoredAgentTurn[];
  readonly modelCalls: StoredAgentModelCall[];
  contextUsage: AgentContextUsage;
}
