export type AgentToolCapabilityKind = 'query' | 'change';

export interface AgentToolCapability {
  readonly description: string;
  readonly kind: AgentToolCapabilityKind;
  readonly label: string;
  readonly name: string;
}

export interface AgentToolCapabilityGroup {
  readonly label: string;
  readonly tools: readonly AgentToolCapability[];
}

export const AGENT_TOOL_CAPABILITY_GROUPS: readonly AgentToolCapabilityGroup[] = [
  {
    label: 'Traffic',
    tools: [
      { name: 'get_proxy_status', label: 'Proxy status', description: 'Read listener and recording state.', kind: 'query' },
      { name: 'get_storage_status', label: 'Capture storage', description: 'Read captured item and byte counts.', kind: 'query' },
      { name: 'start_recording', label: 'Start recording', description: 'Resume capture in the current session.', kind: 'change' },
      { name: 'stop_recording', label: 'Stop recording', description: 'Pause capture without stopping the proxy.', kind: 'change' },
      { name: 'clear_capture', label: 'Clear capture', description: 'Delete captured exchanges and bodies.', kind: 'change' },
      { name: 'list_exchanges', label: 'List exchanges', description: 'Query lightweight captured traffic summaries.', kind: 'query' },
      { name: 'get_exchange', label: 'Exchange detail', description: 'Read headers, timings, TLS, and rule effects.', kind: 'query' },
      { name: 'get_exchange_body', label: 'Exchange body', description: 'Read a bounded body byte range.', kind: 'query' },
      { name: 'list_websocket_messages', label: 'WebSocket messages', description: 'Page through captured WebSocket frames.', kind: 'query' },
      { name: 'list_grpc_messages', label: 'gRPC messages', description: 'Page through decoded gRPC messages.', kind: 'query' },
    ],
  },
  {
    label: 'Rules',
    tools: [
      { name: 'get_rules', label: 'Rule set', description: 'Read the current rule tree and revision.', kind: 'query' },
      { name: 'get_rule_hits', label: 'Rule hits', description: 'Read match counts for current rules.', kind: 'query' },
      { name: 'apply_rules', label: 'Apply rules', description: 'Replace the rule set with revision checking.', kind: 'change' },
    ],
  },
  {
    label: 'Breakpoints',
    tools: [
      { name: 'list_breakpoints', label: 'Pending breakpoints', description: 'Read requests, responses, and frames waiting for action.', kind: 'query' },
      { name: 'enable_http_breakpoints', label: 'Enable HTTP breakpoints', description: 'Start suspending matching HTTP traffic.', kind: 'change' },
      { name: 'disable_http_breakpoints', label: 'Disable HTTP breakpoints', description: 'Stop suspending matching HTTP traffic.', kind: 'change' },
      { name: 'enable_websocket_breakpoint', label: 'Enable WebSocket breakpoint', description: 'Suspend selected frames on one connection.', kind: 'change' },
      { name: 'disable_websocket_breakpoint', label: 'Disable WebSocket breakpoint', description: 'Resume frames on the selected connection.', kind: 'change' },
      { name: 'continue_breakpoint', label: 'Continue breakpoint', description: 'Forward one suspended item unchanged.', kind: 'change' },
      { name: 'forward_edited_breakpoint', label: 'Forward edited breakpoint', description: 'Forward one suspended item with explicit edits.', kind: 'change' },
      { name: 'drop_breakpoint', label: 'Drop breakpoint', description: 'Discard one suspended item.', kind: 'change' },
    ],
  },
  {
    label: 'Requests & diagnostics',
    tools: [
      { name: 'send_request', label: 'Send request', description: 'Send a Composer request from this machine.', kind: 'change' },
      { name: 'probe_connection', label: 'Probe connection', description: 'Open a TLS probe to a host and port.', kind: 'change' },
      { name: 'query_diagnostics', label: 'Query diagnostics', description: 'Read filtered structured diagnostic records.', kind: 'query' },
    ],
  },
];