import { describe, expect, it } from 'vitest';

import {
  INTERCEPTOR_TOOL_NAMES,
  buildInterceptorToolSettingsGroups,
} from '../../src';

const EXPECTED_SETTINGS_COPY = [
  ['get_proxy_status', 'Proxy status', 'Read listener and recording state.'],
  ['get_storage_status', 'Capture storage', 'Read captured item and byte counts.'],
  ['start_recording', 'Start recording', 'Resume capture in the current session.'],
  ['stop_recording', 'Stop recording', 'Pause capture without stopping the proxy.'],
  ['clear_capture', 'Clear capture', 'Delete captured exchanges and bodies.'],
  ['list_exchanges', 'List exchanges', 'Query lightweight captured traffic summaries.'],
  ['get_exchange', 'Exchange detail', 'Read headers, timings, TLS, and rule effects.'],
  ['get_exchange_body', 'Exchange body', 'Read a bounded body byte range.'],
  ['list_websocket_messages', 'WebSocket messages', 'Page through captured WebSocket frames.'],
  ['list_grpc_messages', 'gRPC messages', 'Page through decoded gRPC messages.'],
  ['get_rules', 'Rule set', 'Read the current rule tree and revision.'],
  ['get_rule_hits', 'Rule hits', 'Read match counts for current rules.'],
  ['apply_rules', 'Apply rules', 'Replace the rule set with revision checking.'],
  ['list_breakpoints', 'Pending breakpoints', 'Read requests, responses, and frames waiting for action.'],
  ['enable_http_breakpoints', 'Enable HTTP breakpoints', 'Start suspending matching HTTP traffic.'],
  ['disable_http_breakpoints', 'Disable HTTP breakpoints', 'Stop suspending matching HTTP traffic.'],
  ['enable_websocket_breakpoint', 'Enable WebSocket breakpoint', 'Suspend selected frames on one connection.'],
  ['disable_websocket_breakpoint', 'Disable WebSocket breakpoint', 'Resume frames on the selected connection.'],
  ['continue_breakpoint', 'Continue breakpoint', 'Forward one suspended item unchanged.'],
  ['forward_edited_breakpoint', 'Forward edited breakpoint', 'Forward one suspended item with explicit edits.'],
  ['drop_breakpoint', 'Drop breakpoint', 'Discard one suspended item.'],
  ['send_request', 'Send request', 'Send a Composer request from this machine.'],
  ['probe_connection', 'Probe connection', 'Open a TLS probe to a host and port.'],
  ['query_diagnostics', 'Query diagnostics', 'Read filtered structured diagnostic records.'],
] as const;

describe('Tool Settings projection', () => {
  it('projects every executable Tool once into the four designed Settings groups', () => {
    const groups = buildInterceptorToolSettingsGroups();

    expect(groups.map((group) => [group.id, group.title])).toEqual([
      ['traffic', 'Traffic'],
      ['rules', 'Rules'],
      ['breakpoints', 'Breakpoints'],
      ['requests-diagnostics', 'Requests & diagnostics'],
    ]);
    expect(groups.flatMap((group) => group.tools.map((tool) => tool.name)))
      .toEqual(INTERCEPTOR_TOOL_NAMES);
    expect(groups.flatMap((group) => group.tools)).toHaveLength(24);
  });

  it('exposes display metadata without schemas or executors', () => {
    const settingsTools = buildInterceptorToolSettingsGroups().flatMap((group) => group.tools);
    const proxyStatus = settingsTools[0];

    expect(proxyStatus).toEqual({
      name: 'get_proxy_status',
      title: 'Proxy status',
      description: 'Read listener and recording state.',
      kind: 'query',
    });
    expect(proxyStatus).not.toHaveProperty('inputSchema');
    expect(proxyStatus).not.toHaveProperty('execute');
    expect(settingsTools.map((tool) => [tool.name, tool.title, tool.description]))
      .toEqual(EXPECTED_SETTINGS_COPY);
  });
});