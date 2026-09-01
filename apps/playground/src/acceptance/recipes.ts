import type { INTERCEPTOR_TOOL_NAMES } from '@interceptor/tools';

export interface AcceptanceRecipe {
  readonly observations: readonly string[];
  readonly setup: readonly string[];
}

type CurrentToolName = (typeof INTERCEPTOR_TOOL_NAMES)[number];

const CURRENT_ACCEPTANCE_RECIPES = {
  get_proxy_status: recipe(
    ['Open Capture and note listener and Recording state.'],
    ['Result matches the visible listener and Recording state.', 'No approval appears.'],
  ),
  get_storage_status: recipe(
    ['Capture at least one Playground request and open Settings > Storage.'],
    ['Counts and byte usage agree with the visible product state.', 'No approval appears.'],
  ),
  start_recording: recipe(
    ['Pause Recording in Capture.', 'Keep this MCP Client in Ask mode.'],
    ['Deny keeps Recording paused.', 'Allow starts Recording and updates Capture.'],
  ),
  stop_recording: recipe(
    ['Start Recording in Capture.', 'Keep this MCP Client in Ask mode.'],
    ['Deny keeps Recording active.', 'Allow pauses capture without stopping proxy forwarding.'],
  ),
  clear_capture: recipe(
    ['Capture Playground traffic and note row and storage counts.'],
    ['Deny preserves all rows.', 'Allow clears Capture through the formal product command.'],
  ),
  list_exchanges: recipe(
    ['Run two distinct Traffic Lab scenarios while Recording.'],
    ['Both exchanges are listed with stable IDs and expected summaries.', 'Sensitive headers are masked.'],
  ),
  get_exchange: recipe(
    ['Copy an exchangeId from list_exchanges.'],
    ['Headers, timing, TLS and rule effects match Capture Inspector.', 'Sensitive values are masked.'],
  ),
  get_exchange_body: recipe(
    ['Choose an exchange with a visible body and copy its exchangeId and bodyId.'],
    ['Returned bytes belong to that exchange and body.', 'Range bounds and trusted MIME are visible.'],
  ),
  list_websocket_messages: recipe(
    ['Create a WebSocket exchange with sent and received messages.'],
    ['Message order, direction and payload agree with Capture.', 'Binary output is bounded.'],
  ),
  list_grpc_messages: recipe(
    ['Create a captured gRPC exchange with at least one message.'],
    ['Message direction, sequence and bounded payload agree with Capture.'],
  ),
  get_rules: recipe(
    ['Create and Apply a small enabled Rule tree in the product UI.'],
    ['Returned revision, folders, rule order and enabled state match Rules.'],
  ),
  get_rule_hits: recipe(
    ['Apply a Rule and run matching and non-matching Traffic Lab requests.'],
    ['Hit count reflects unique matching exchanges and agrees with Rules.'],
  ),
  apply_rules: recipe(
    ['Export or inspect the current Rule revision.', 'Keep a visible local draft for conflict checks.'],
    ['Deny preserves current rules.', 'Allow replaces only at the expected revision and preserves folder/enabled fields.'],
  ),
  list_breakpoints: recipe(
    ['Enable HTTP breakpoints and create at least one pending request.'],
    ['Queue order, ruleId, exchangeId and editable-head status match Capture.'],
  ),
  enable_http_breakpoints: recipe(
    ['Disable HTTP breakpoints in the Breakpoint manager.'],
    ['Deny remains disabled.', 'Allow enables the same product switch.'],
  ),
  disable_http_breakpoints: recipe(
    ['Enable HTTP breakpoints in the Breakpoint manager.'],
    ['Deny remains enabled.', 'Allow disables future HTTP breakpoint suspension.'],
  ),
  enable_websocket_breakpoint: recipe(
    ['Create a live captured WebSocket connection and note its exchangeId.'],
    ['Deny leaves frames flowing.', 'Allow enables only the requested connection, direction and frame kinds.'],
  ),
  disable_websocket_breakpoint: recipe(
    ['Enable a WebSocket breakpoint for one live exchange.'],
    ['Deny preserves the setup.', 'Allow removes only that connection setup.'],
  ),
  continue_breakpoint: recipe(
    ['Create a pending HTTP breakpoint at the queue head.'],
    ['Deny keeps it pending.', 'Allow forwards unmodified data once and advances the queue.'],
  ),
  forward_edited_breakpoint: recipe(
    ['Create a pending breakpoint and prepare explicit header or body edits.'],
    ['Deny changes nothing.', 'Allow sends exact edited wire data and records effects.'],
  ),
  drop_breakpoint: recipe(
    ['Create a pending breakpoint and keep an origin observation ready.'],
    ['Deny keeps it pending.', 'Allow drops it once and origin does not receive forwarded data.'],
  ),
  send_request: recipe(
    ['Prepare a Playground origin URL and explicit request fields.'],
    ['Deny sends nothing.', 'Allow returns the same response and timing as Composer direct-send semantics.'],
  ),
  probe_connection: recipe(
    ['Prepare a reachable Playground TLS endpoint and an unreachable port.'],
    ['Deny performs no probe.', 'Allow reports real handshake facts without changing TLS settings.'],
  ),
  query_diagnostics: recipe(
    ['Perform a known product action that writes a diagnostic record.'],
    ['Query returns that bounded redacted record in stable time order.', 'No approval appears.'],
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