import type { McpClientRegistration, McpToolExecutionMode } from '@interceptor/mcp-server';
import type { McpApprovalRequest, McpAuditEvent } from '@interceptor/mcp-server';

import type { SecureStore } from '../../interfaces';
import type { CaptureReset, CaptureStatus } from '../../../shared/desktop-api';
import type { CoreRuntime } from '../../core/core-runtime';
import type { ToolCapabilitySettingsService } from '../../tool-capabilities/entry';

/** Main内部持久化的Client记录。 */
export interface McpStoredClient extends McpClientRegistration {
  /** change Tool执行模式。 */
  readonly executionMode: McpToolExecutionMode;
}

/** Main内部固定持久化结构。 */
export interface McpSettingsRecord {
  /** 是否应在Desktop启动时监听MCP endpoint。 */
  readonly enabled: boolean;
  /** 首次启用后固定的loopback端口。 */
  readonly endpointPort: number | null;
  /** 按创建顺序保存的Client。 */
  readonly clients: readonly McpStoredClient[];
}

/** 不含凭据、可安全投影到Renderer的Store快照。 */
export interface McpSettingsSnapshot {
  /** 用户是否启用了MCP Server。 */
  readonly enabled: boolean;
  /** 已分配端口；fresh profile为null。 */
  readonly endpointPort: number | null;
  /** Client公开设置。 */
  readonly clients: readonly Omit<McpStoredClient, 'token'>[];
}

/** MCP Settings Store构造边界。 */
export interface McpSettingsStoreOptions {
  /** `<userData>/mcp`目录。 */
  readonly dataDirectory: string;
  /** OS-backed加密边界。 */
  readonly secureStore: SecureStore;
}

/** Renderer-safe MCP Client summary. */
export interface McpDesktopClientSummary {
  readonly clientId: string;
  readonly label: string;
  readonly executionMode: McpToolExecutionMode;
}

/** Public operational state of the Desktop MCP endpoint. */
export interface McpDesktopStatus {
  readonly state: 'disabled' | 'running' | 'endpoint-conflict';
  readonly endpoint: string | null;
  readonly detail: string | null;
  readonly clients: readonly McpDesktopClientSummary[];
}

/** Desktop MCP composition root dependencies. */
export interface McpDesktopServiceOptions {
  readonly appVersion: string;
  readonly coreRuntime: CoreRuntime;
  readonly dataDirectory: string;
  readonly secureStore: SecureStore;
  readonly toolCapabilitySettingsService: ToolCapabilitySettingsService;
  readonly approvalRequested: (request: McpApprovalRequest) => void;
  readonly approvalClosed: (approvalId: string) => void;
  readonly captureStatusChanged: (captureStatus: CaptureStatus) => void;
  readonly captureReset: (captureReset: CaptureReset) => void;
  readonly copyText: (value: string) => void | Promise<void>;
  readonly showAndFocusWindow: () => void;
  readonly recordAudit?: (event: McpAuditEvent) => void;
  readonly approvalTimeoutMilliseconds?: number;
}