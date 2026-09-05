import type { INTERCEPTOR_TOOL_NAMES } from '@interceptor/tools';

export interface AcceptanceRecipe {
  readonly observations: readonly string[];
  readonly setup: readonly string[];
}

type CurrentToolName = (typeof INTERCEPTOR_TOOL_NAMES)[number];

const CURRENT_ACCEPTANCE_RECIPES = {
  capture_get_proxy_status: recipe(
    ['Open Capture and note listener and Recording state.'],
    ['Result matches the visible listener and Recording state.', 'No approval appears.'],
  ),
  capture_get_storage_status: recipe(
    ['Capture at least one Playground request and open Settings > Storage.'],
    ['Counts and byte usage agree with the visible product state.', 'No approval appears.'],
  ),
  capture_start_recording: recipe(
    ['Pause Recording in Capture.', 'Keep this MCP Client in Ask mode.'],
    ['Deny keeps Recording paused.', 'Allow starts Recording and updates Capture.'],
  ),
  capture_stop_recording: recipe(
    ['Start Recording in Capture.', 'Keep this MCP Client in Ask mode.'],
    ['Deny keeps Recording active.', 'Allow pauses capture without stopping proxy forwarding.'],
  ),
  capture_clear: recipe(
    ['Capture Playground traffic and note row and storage counts.'],
    ['Deny preserves all rows.', 'Allow clears Capture through the formal product command.'],
  ),
  capture_list_exchanges: recipe(
    ['Run two distinct Traffic Lab scenarios while Recording.'],
    ['Both exchanges are listed with stable IDs and expected summaries.', 'Sensitive headers are masked.'],
  ),
  capture_get_exchange: recipe(
    ['Copy an exchangeId from capture_list_exchanges.'],
    ['Headers, timing, TLS and rule effects match Capture Inspector.', 'Sensitive values are masked.'],
  ),
  capture_get_exchange_body: recipe(
    ['Choose an exchange with a visible body and copy its exchangeId and bodyId.'],
    ['Returned bytes belong to that exchange and body.', 'Range bounds and trusted MIME are visible.'],
  ),
  capture_list_websocket_messages: recipe(
    ['Create a WebSocket exchange with sent and received messages.'],
    ['Message order, direction and payload agree with Capture.', 'Binary output is bounded.'],
  ),
  capture_list_grpc_messages: recipe(
    ['Create a captured gRPC exchange with at least one message.'],
    ['Message direction, sequence and bounded payload agree with Capture.'],
  ),
  rules_get_tree: recipe(
    ['Create and Apply a small enabled Rule tree in the product UI.'],
    ['Returned revision, folders, rule order and enabled state match Rules.'],
  ),
  rules_get_hits: recipe(
    ['Apply a Rule and run matching and non-matching Traffic Lab requests.'],
    ['Hit count reflects unique matching exchanges and agrees with Rules.'],
  ),
  rules_replace_tree: recipe(
    ['Export or inspect the current Rule revision.', 'Keep a visible local draft for conflict checks.'],
    ['Deny preserves current rules.', 'Allow replaces only at the expected revision and preserves folder/enabled fields.'],
  ),
  breakpoints_list: recipe(
    ['Enable HTTP breakpoints and create at least one pending request.'],
    ['Queue order, ruleId, exchangeId and editable-head status match Capture.'],
  ),
  breakpoints_enable_http: recipe(
    ['Disable HTTP breakpoints in the Breakpoint manager.'],
    ['Deny remains disabled.', 'Allow enables the same product switch.'],
  ),
  breakpoints_disable_http: recipe(
    ['Enable HTTP breakpoints in the Breakpoint manager.'],
    ['Deny remains enabled.', 'Allow disables future HTTP breakpoint suspension.'],
  ),
  breakpoints_enable_websocket: recipe(
    ['Create a live captured WebSocket connection and note its exchangeId.'],
    ['Deny leaves frames flowing.', 'Allow enables only the requested connection, direction and frame kinds.'],
  ),
  breakpoints_disable_websocket: recipe(
    ['Enable a WebSocket breakpoint for one live exchange.'],
    ['Deny preserves the setup.', 'Allow removes only that connection setup.'],
  ),
  breakpoints_continue: recipe(
    ['Create a pending HTTP breakpoint at the queue head.'],
    ['Deny keeps it pending.', 'Allow forwards unmodified data once and advances the queue.'],
  ),
  breakpoints_forward_edited: recipe(
    ['Create a pending breakpoint and prepare explicit header or body edits.'],
    ['Deny changes nothing.', 'Allow sends exact edited wire data and records effects.'],
  ),
  breakpoints_drop: recipe(
    ['Create a pending breakpoint and keep an origin observation ready.'],
    ['Deny keeps it pending.', 'Allow drops it once and origin does not receive forwarded data.'],
  ),
  composer_send_request: recipe(
    ['Prepare a Playground origin URL and explicit request fields.'],
    ['Deny sends nothing.', 'Allow returns the same response and timing as Composer direct-send semantics.'],
  ),
  composer_probe_connection: recipe(
    ['Prepare a reachable Playground TLS endpoint and an unreachable port.'],
    ['Deny performs no probe.', 'Allow reports real handshake facts without changing TLS settings.'],
  ),
  diagnostics_query: recipe(
    ['Perform a known product action that writes a diagnostic record.'],
    ['Query returns that bounded redacted record in stable time order.', 'No approval appears.'],
  ),
  settings_get_core_process_status: recipe(
    ['Open Interceptor and note the Core process state and PID.'],
    ['Lifecycle and PID match the running Core process, not a claim of listener health.', 'No approval or configuration change occurs.'],
  ),
  settings_get_system_proxy_status: recipe(
    ['Open Settings > Proxy and note ownership and enabled state.'],
    ['Ownership and upstream reachability match the product state.', 'No raw proxy server, bypass list, PAC URL or credential is returned.'],
  ),
  settings_get_certificate_status: recipe(
    ['Open Settings > Certificates without generating or installing a CA.'],
    ['Public identity, trust and decryption state match Settings.', 'No local path or private key is returned and no UAC appears.'],
  ),
  settings_get_tls_insecure_hosts: recipe(
    ['Add one test host in Settings > Certificates and note the existing host list.'],
    ['The returned host list matches Settings and stays unchanged after the query.', 'Remove the test host through Settings after inspection.'],
  ),
  settings_get_tls_passthrough: recipe(
    ['Add one test pattern in Settings > TLS passthrough.'],
    ['The pattern and revision are returned without changing configuration.', 'Remove the test pattern through Settings after inspection.'],
  ),
  settings_list_app_containers: recipe(
    ['Open Settings > App Containers on Windows and note loopback access states.'],
    ['SIDs, names and exemption states match Settings without paths.', 'No exemption changes or UAC occur; unsupported platforms report supported=false.'],
  ),
  settings_enable_system_proxy: recipe(
    ['Restore the system proxy through Settings > Proxy.', 'Keep this MCP Client in Ask mode.'],
    ['Deny leaves the original system configuration unchanged.', 'Allow takes ownership through the same product command and updates Settings.', 'Auto skips only approval; restore the original settings after inspection.'],
  ),
  settings_restore_system_proxy: recipe(
    ['Let Interceptor take system proxy ownership and keep this MCP Client in Ask mode.'],
    ['Deny keeps ownership unchanged.', 'Allow restores the original system proxy and removes the ownership journal.', 'A repeated call returns restored=false with reason=not-owned without changing system settings.'],
  ),
} satisfies Readonly<Record<CurrentToolName, AcceptanceRecipe>>;

export const ACCEPTANCE_RECIPES: Readonly<Record<string, AcceptanceRecipe>> =
  CURRENT_ACCEPTANCE_RECIPES;

export function acceptanceRecipe(toolName: string): AcceptanceRecipe | undefined {
  return ACCEPTANCE_RECIPES[toolName];
}

function recipe(
  setup: readonly string[],
  observations: readonly string[],
): AcceptanceRecipe {
  return { observations, setup };
}