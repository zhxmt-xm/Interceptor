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
  capture_get_transfer_job: recipe(
    ['Start a file export through the product UI or diagnostics_export and retain its jobId.'],
    ['State, progress and warning count match the current job without approval.', 'The result does not reveal file names, paths or warning text.', 'Unknown identities and jobs from a previous Core process return job=null.'],
  ),
  capture_cancel_transfer_job: recipe(
    ['Capture enough Traffic Lab data to keep an Archive export running, then start Export through the product UI.', 'Keep the MCP Client in Ask mode and retain the running jobId.'],
    ['Deny leaves the task running.', 'Allow and Auto cancel only the selected task; confirm no destination file or temporary file is left.', 'Completed, failed and cancelled jobs keep their terminal state; existing saved files and other jobs remain unchanged.', 'The compact result shows actual state and progress, without local file information.'],
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
  rules_export: recipe(
    ['Create and Apply Rules with a folder and mixed enabled states through the product UI.', 'Keep this MCP Client in Ask mode and leave a distinguishable unapplied draft.'],
    ['Deny opens no native dialog and writes nothing.', 'Allow opens the native Save Dialog; Cancel returns exported=false.', 'Saving and Auto export the persisted tree without changing the UI draft.', 'Only exported is returned; no file path or Rule content is disclosed.'],
  ),
  rules_import: recipe(
    ['Create and Apply a Rule tree with a folder and mixed enabled states.', 'Use product Export to create the import file, then keep a distinguishable unapplied draft.'],
    ['Deny opens no file dialog; canceling Open or the import preview changes no Rules.', 'Allow and Auto both require native selection and the existing import confirmation.', 'Confirmation appends fresh IDs and persists them together with the existing draft.', 'Repeated import appends another copy; only counts and revision are returned, without file content or paths.'],
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
  breakpoints_continue_queue: recipe(
    ['Create multiple HTTP pending requests through applied breakpoint Rules and one pending WebSocket frame in another queue.', 'Read the target queueKey through breakpoints_list and keep an unsent editor draft.'],
    ['Deny keeps all requests and frames pending.', 'Allow forwards only the target queue unchanged and ignores editor drafts.', 'The returned resolvedCount matches the invocation-time target count; other queues remain pending.', 'Auto uses the same command and an empty target returns zero.'],
  ),
  breakpoints_drop_queue: recipe(
    ['Create multiple pending requests or frames and keep an independent queue pending.', 'Read the target queueKey and prepare an origin observation.'],
    ['Deny keeps the queue unchanged.', 'Allow and Auto discard only the target queue without forwarding its contents.', 'Other queues remain pending and resolvedCount reports the actual count.', 'Repeating after the queue is empty returns zero.'],
  ),
  breakpoints_continue_rule: recipe(
    ['Create two applied breakpoint Rules with different matchers and produce pending traffic for both.', 'Read one real ruleId from breakpoints_list.'],
    ['Deny keeps every pending item unchanged.', 'Allow and Auto forward only items from the selected Rule, preserving original content.', 'Other Rules and WebSocket queues remain pending.', 'The result contains only resolvedCount; an empty Rule target returns zero.'],
  ),
  composer_send_request: recipe(
    ['Prepare a Playground origin URL and explicit request fields.'],
    ['Deny sends nothing.', 'Allow returns the same response and timing as Composer direct-send semantics.'],
  ),
  composer_probe_connection: recipe(
    ['Prepare a reachable Playground TLS endpoint and an unreachable port.'],
    ['Deny performs no probe.', 'Allow reports real handshake facts without changing TLS settings.'],
  ),
  composer_get_collection: recipe(
    ['Create two Composer requests and a folder through the UI, including test authentication fields.', 'Wait until the Collection has been saved.'],
    ['The returned revision, identities, folders and request fields match the saved Collection.', 'Auth, sensitive headers and query values are masked; no request is sent and no approval appears.'],
  ),
  composer_replace_collection: recipe(
    ['Read the current Collection and revision, then prepare a name change using that returned tree.', 'Keep Composer open and the MCP Client in Ask mode.'],
    ['Deny preserves the tree and revision.', 'Allow and Auto update the mounted Collection without sending requests.', 'Unchanged masked fields retain their original credentials; stale revisions cannot overwrite newer data.', 'Restart the app and verify the saved Collection and permissions remain unchanged.'],
  ),
  composer_export_collection: recipe(
    ['Create a Composer folder and requests with Header, Query, JSON/Form and test Auth values.', 'Wait for autosave and keep this MCP Client in Ask mode.'],
    ['Deny opens no file dialog and writes nothing.', 'Allow opens the native Save Dialog; Cancel returns exported=false.', 'Saving and Auto preserve the complete saved Collection without sending requests.', 'Only exported is returned; file paths and request content are not disclosed.'],
  ),
  composer_import_collection: recipe(
    ['Create requests and a folder through Composer, then use product Export to produce the import file.', 'Keep this MCP Client in Ask mode.'],
    ['Deny opens no file dialog; canceling Open or the preview changes nothing.', 'Allow and Auto both require native selection and the same import confirmation.', 'Confirmation appends fresh node and field IDs after any in-flight autosave, preserving all request content.', 'Repeated import appends another copy; only revision and counts are returned.', 'Restart and verify persistence without replaying file operations or sending requests.'],
  ),
  diagnostics_query: recipe(
    ['Perform a known product action that writes a diagnostic record.'],
    ['Query returns that bounded redacted record in stable time order.', 'No approval appears.'],
  ),
  diagnostics_get_trace: recipe(
    ['Send a Composer request and obtain its traceId from a Diagnostics query in the current Core process.'],
    ['At most 200 matching records are returned in recorded order without approval.', 'Unknown trace identities return an empty list without reading another trace.', 'The compact result shows counts, not raw attributes; credentials and request bodies remain absent.'],
  ),
  diagnostics_get_recent: recipe(
    ['Perform a product action during the current Core process and note its Diagnostics records.'],
    ['The requested 1..200 most recent records keep their original order; the default limit is 200.', 'Queries are silent, require no approval, and do not return persisted history from earlier Core processes.', 'The result preserves droppedCount and masks sensitive record fields.'],
  ),
  diagnostics_export: recipe(
    ['Create real Diagnostics records through Composer and choose process, minimum level and outcome filters.', 'Keep the MCP Client in Ask mode and choose a test output destination.'],
    ['Deny opens no file dialog; native Save cancellation returns started=false.', 'Allow and Auto retain the native Save Dialog and reuse the product atomic JSONL export.', 'started=true returns only a safe job identity, state, progress and warning count; it is not proof of completed export.', 'Inspect the completed JSONL for valid records, the selected filters and removal of credentials; paths and file names are not in Tool results.'],
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
  settings_replace_tls_insecure_hosts: recipe(
    ['Read and retain the existing insecure host list.', 'Keep Settings > Certificates open and use an isolated test host.'],
    ['Deny preserves the list; Allow updates the mounted panel.', 'Auto and an empty list use the same product path.', 'Restore the original list after inspection.'],
  ),
  settings_replace_tls_passthrough: recipe(
    ['Read the current passthrough revision and retain the existing patterns.', 'Keep Settings > TLS passthrough open.'],
    ['Allow saves normalized patterns and refreshes the mounted panel.', 'A stale revision returns conflict without overwriting the current list.', 'Restore the original patterns using the latest revision.'],
  ),
  settings_enable_https_decryption: recipe(
    ['Note the existing CA trust and decryption intent.', 'Use the product Certificates UI for any required test CA generation and installation.'],
    ['Without a trusted CA, intent may be enabled while decrypting remains false.', 'Deny changes nothing; Allow and Auto return the effective Core state and refresh the panel.', 'Restore the prior decryption intent and remove any test CA trust through the product UI.'],
  ),
  settings_disable_https_decryption: recipe(
    ['Note the current decryption intent and certificate identity before the call.'],
    ['Deny preserves the current state.', 'Allow and Auto disable effective decryption without changing certificate identity or trust.', 'Restore the original intent after inspection.'],
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