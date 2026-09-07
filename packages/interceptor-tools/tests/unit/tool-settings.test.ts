import { describe, expect, it } from 'vitest';

import {
  INTERCEPTOR_TOOL_NAMES,
  buildInterceptorToolSettingsGroups,
} from '../../src';

const EXPECTED_SETTINGS_COPY = [
  ['capture_get_proxy_status', 'Proxy status', 'Read listener and recording state.'],
  ['capture_get_storage_status', 'Capture storage', 'Read captured item and byte counts.'],
  ['capture_start_recording', 'Start recording', 'Resume capture in the current session.'],
  ['capture_stop_recording', 'Stop recording', 'Pause capture without stopping the proxy.'],
  ['capture_clear', 'Clear capture', 'Delete captured exchanges and bodies.'],
  ['capture_list_exchanges', 'List exchanges', 'Query lightweight captured traffic summaries.'],
  ['capture_get_exchange', 'Exchange detail', 'Read headers, timings, TLS, and rule effects.'],
  ['capture_get_exchange_body', 'Exchange body', 'Read a bounded body byte range.'],
  ['capture_list_websocket_messages', 'WebSocket messages', 'Page through captured WebSocket frames.'],
  ['capture_list_grpc_messages', 'gRPC messages', 'Page through decoded gRPC messages.'],
  ['capture_get_transfer_job', 'Get file transfer job', 'Read one file transfer state and progress without revealing local file information.'],
  ['capture_cancel_transfer_job', 'Cancel file transfer job', 'Cancel one running file transfer; completed, failed and cancelled jobs stay unchanged.'],
  ['capture_export_body', 'Export captured body', 'Save a captured body in full through the native Save Dialog, without exposing body bytes or local file information.'],
  ['capture_export_har', 'Export HAR', 'Export captured HTTP exchanges as HAR 1.2 through the native Save Dialog.'],
  ['capture_import_har', 'Import HAR', 'Import a HAR file chosen through the native Open Dialog into a separate Capture session.'],
  ['rules_get_tree', 'Rule set', 'Read the current rule tree and revision.'],
  ['rules_get_hits', 'Rule hits', 'Read match counts for current rules.'],
  ['rules_replace_tree', 'Apply rules', 'Replace the rule set with revision checking.'],
  ['rules_export', 'Export Rules', 'Export the saved Rule tree to a JSON file chosen through the native Save Dialog.'],
  ['rules_import', 'Import Rules', 'Choose an exported Rule file and confirm appending it through the product import preview.'],
  ['composer_send_request', 'Send request', 'Send a Composer request from this machine.'],
  ['composer_probe_connection', 'Probe connection', 'Open a TLS probe to a host and port.'],
  ['composer_get_collection', 'Get Collection', 'Read the saved Composer Collection and revision with credentials redacted.'],
  ['composer_replace_collection', 'Replace Collection', 'Replace the saved Composer Collection with revision checking.'],
  ['composer_export_collection', 'Export Collection', 'Export the saved Collection to a JSON file chosen through the native Save Dialog.'],
  ['composer_import_collection', 'Import Collection', 'Choose an exported Collection and confirm appending it through the product import preview.'],
  ['breakpoints_list', 'Pending breakpoints', 'Read requests, responses, and frames waiting for action.'],
  ['breakpoints_enable_http', 'Enable HTTP breakpoints', 'Start suspending matching HTTP traffic.'],
  ['breakpoints_disable_http', 'Disable HTTP breakpoints', 'Stop suspending matching HTTP traffic.'],
  ['breakpoints_enable_websocket', 'Enable WebSocket breakpoint', 'Suspend selected frames on one connection.'],
  ['breakpoints_disable_websocket', 'Disable WebSocket breakpoint', 'Resume frames on the selected connection.'],
  ['breakpoints_continue', 'Continue breakpoint', 'Forward one suspended item unchanged.'],
  ['breakpoints_forward_edited', 'Forward edited breakpoint', 'Forward one suspended item with explicit edits.'],
  ['breakpoints_drop', 'Drop breakpoint', 'Discard one suspended item.'],
  ['breakpoints_continue_queue', 'Continue breakpoint queue', 'Forward all currently pending items in one logical queue unchanged.'],
  ['breakpoints_drop_queue', 'Drop breakpoint queue', 'Discard all currently pending items in one logical queue.'],
  ['breakpoints_continue_rule', 'Continue breakpoints from one Rule', 'Forward all currently pending items from one Rule unchanged.'],
  ['diagnostics_query', 'Query diagnostics', 'Read filtered structured diagnostic records.'],
  ['diagnostics_get_trace', 'Get current Core trace', 'Read up to 200 records for one trace from the current Core process, in recorded order.'],
  ['diagnostics_get_recent', 'Get recent Core diagnostics', 'Read recent records from the current Core process in recorded order, without querying persisted history.'],
  ['diagnostics_export', 'Export Diagnostics', 'Start an atomic redacted JSONL export using the native Save Dialog and existing transfer service.'],
  ['settings_get_core_process_status', 'Core process status', 'Read the Core process lifecycle, not listener or upstream health.'],
  ['settings_get_system_proxy_status', 'System proxy status', 'Read system proxy ownership and upstream reachability without raw OS configuration.'],
  ['settings_get_certificate_status', 'Certificate status', 'Read public Root CA identity, trust, and HTTPS decryption state without local paths.'],
  ['settings_get_tls_insecure_hosts', 'Insecure TLS hosts', 'Read configured hosts that skip upstream TLS certificate verification.'],
  ['settings_get_tls_passthrough', 'TLS passthrough settings', 'Read TLS passthrough host patterns and their current revision.'],
  ['settings_list_app_containers', 'AppContainer access', 'Read supported Windows AppContainer identities and loopback exemption state.'],
  ['settings_enable_system_proxy', 'Enable system proxy', 'Route system traffic through Interceptor using the active proxy listener.'],
  ['settings_restore_system_proxy', 'Restore system proxy', 'Restore the system proxy configuration saved before Interceptor took ownership.'],
  ['settings_replace_tls_insecure_hosts', 'Replace insecure TLS hosts', 'Replace hosts that skip upstream TLS certificate verification.'],
  ['settings_replace_tls_passthrough', 'Replace TLS passthrough', 'Replace TLS passthrough patterns at the current revision.'],
  ['settings_enable_https_decryption', 'Enable HTTPS decryption', 'Enable HTTPS decryption when the existing Root CA is trusted.'],
  ['settings_disable_https_decryption', 'Disable HTTPS decryption', 'Disable HTTPS decryption without changing certificate trust.'],
] as const;

describe('Tool Settings projection', () => {
  it('projects every executable Tool once into six feature Settings groups', () => {
    const groups = buildInterceptorToolSettingsGroups();

    expect(groups.map((group) => [group.id, group.title])).toEqual([
      ['capture', 'Capture'],
      ['rules', 'Rules'],
      ['composer', 'Composer'],
      ['breakpoints', 'Breakpoints'],
      ['diagnostics', 'Diagnostics'],
      ['settings', 'Settings'],
    ]);
    expect(groups.flatMap((group) => group.tools.map((tool) => tool.name)))
      .toEqual(INTERCEPTOR_TOOL_NAMES);
    expect(groups.flatMap((group) => group.tools)).toHaveLength(53);
    expect(groups.every((group) => (
      group.tools.every((tool) => tool.name.startsWith(`${group.id}_`))
    ))).toBe(true);
  });

  it('exposes display metadata without schemas or executors', () => {
    const settingsTools = buildInterceptorToolSettingsGroups().flatMap((group) => group.tools);
    const proxyStatus = settingsTools[0];

    expect(proxyStatus).toEqual({
      name: 'capture_get_proxy_status',
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