import {
  defineTool,
  ToolExecutionError,
  z,
  type AgentMessage,
  type AgentTool,
  type AgentToolSource,
  type AgentToolSourceSnapshot,
  type ToolExecutionResult,
} from '@interceptor/agent-runtime';
import type { CoreCommand, CoreResultForCommand } from '@interceptor/core-protocol';
import {
  InterceptorToolArgumentError,
  buildInterceptorToolCatalog,
  buildInterceptorToolRegistry,
  type InterceptorToolDefinition,
  type InterceptorToolHost,
  type ToolDiscoveryMatch,
} from '@interceptor/tools';

import type { CaptureReset, CaptureStatus, RulesChanged } from '../../shared/desktop-api';
import type { CoreRuntime } from '../core/core-runtime';
import type { ToolCapabilitySettingsService } from '../tool-capabilities/entry';

const CONNECTED_AGENT_TOOL_NAMES = [
  { name: 'capture_get_proxy_status', kind: 'query' },
  { name: 'capture_get_storage_status', kind: 'query' },
  { name: 'capture_start_recording', kind: 'change' },
  { name: 'capture_stop_recording', kind: 'change' },
  { name: 'capture_clear', kind: 'change' },
  { name: 'capture_list_exchanges', kind: 'query' },
  { name: 'capture_get_exchange', kind: 'query' },
  { name: 'capture_get_exchange_body', kind: 'query' },
  { name: 'capture_list_websocket_messages', kind: 'query' },
  { name: 'capture_list_grpc_messages', kind: 'query' },
  { name: 'rules_get_tree', kind: 'query' },
  { name: 'rules_get_hits', kind: 'query' },
  { name: 'rules_replace_tree', kind: 'change' },
  { name: 'composer_send_request', kind: 'change' },
  { name: 'composer_probe_connection', kind: 'change' },
  { name: 'breakpoints_list', kind: 'query' },
  { name: 'breakpoints_enable_http', kind: 'change' },
  { name: 'breakpoints_disable_http', kind: 'change' },
  { name: 'breakpoints_enable_websocket', kind: 'change' },
  { name: 'breakpoints_disable_websocket', kind: 'change' },
  { name: 'breakpoints_continue', kind: 'change' },
  { name: 'breakpoints_forward_edited', kind: 'change' },
  { name: 'breakpoints_drop', kind: 'change' },
] as const;

const DISCOVER_TOOLS_NAME = 'discover_tools';

/** Adapts the shared Tool registry, Settings and CoreRuntime into Agent snapshots. */
export class AgentToolService implements AgentToolSource {
  readonly #coreRuntime: CoreRuntime;
  readonly #toolCapabilitySettingsService: ToolCapabilitySettingsService;
  readonly #definitions: readonly InterceptorToolDefinition[];
  readonly #catalog: ReturnType<typeof buildInterceptorToolCatalog>;
  readonly #interceptorToolHost: InterceptorToolHost;
  readonly #captureStatusChanged: (captureStatus: CaptureStatus) => void;
  readonly #captureReset: (captureReset: CaptureReset) => void;
  readonly #rulesChanged: (change: RulesChanged) => void;

  constructor(
    coreRuntime: CoreRuntime,
    toolCapabilitySettingsService: ToolCapabilitySettingsService,
    captureStatusChanged: (captureStatus: CaptureStatus) => void,
    captureReset: (captureReset: CaptureReset) => void,
    rulesChanged: (change: RulesChanged) => void,
  ) {
    this.#coreRuntime = coreRuntime;
    this.#toolCapabilitySettingsService = toolCapabilitySettingsService;
    this.#captureStatusChanged = captureStatusChanged;
    this.#captureReset = captureReset;
    this.#rulesChanged = rulesChanged;
    const definitionsByName = new Map(
      buildInterceptorToolRegistry().map((definition) => [definition.name, definition]),
    );
    this.#definitions = CONNECTED_AGENT_TOOL_NAMES.map(({ name, kind }) => {
      const definition = definitionsByName.get(name);
      if (definition === undefined || definition.kind !== kind) {
        throw new Error(`Agent Tool "${name}" must be an implemented ${kind} Tool.`);
      }
      return definition;
    });
    this.#catalog = buildInterceptorToolCatalog(this.#definitions);
    this.#interceptorToolHost = {
      invoke: <T extends CoreCommand>(
        command: T,
        abortSignal: AbortSignal,
      ): Promise<CoreResultForCommand<T>> => this.#invokeCore(command, abortSignal),
    };
  }

  /** Invoke one shared Tool command and publish committed Capture state changes. */
  async #invokeCore<T extends CoreCommand>(
    command: T,
    abortSignal: AbortSignal,
  ): Promise<CoreResultForCommand<T>> {
    const captureReset = command.type === 'capture.cleanup'
      ? { clearedBefore: Date.now() }
      : null;
    const result = await this.#coreRuntime.request(command, { abortSignal });
    if (command.type === 'proxy.start' || command.type === 'proxy.setRecording') {
      this.#captureStatusChanged(result.payload as CaptureStatus);
    }
    if (captureReset !== null) {
      this.#captureReset(captureReset);
    }
    if (command.type === 'rules.replace') {
      this.#rulesChanged(result.payload as RulesChanged);
    }
    return result;
  }

  /** Returns capabilities, discovery and previously disclosed enabled Tools for one Model Call. */
  snapshot(messages: readonly AgentMessage[]): AgentToolSourceSnapshot {
    const enabledDefinitions = this.#enabledDefinitions();
    const enabledNames = new Set(enabledDefinitions.map((definition) => definition.name));
    const disclosedNames = this.#disclosedToolNames(messages);
    const disclosedDefinitions = enabledDefinitions.filter((definition) => (
      disclosedNames.has(definition.name)
    ));
    return {
      systemMessages: [{
        role: 'system',
        content: this.#capabilityIndex(enabledDefinitions),
      }],
      tools: [
        this.#discoverTool(),
        ...disclosedDefinitions.map((definition) => this.#agentTool(definition)),
      ],
    };
  }

  /** Returns currently enabled definitions in the fixed product connection order. */
  #enabledDefinitions(): readonly InterceptorToolDefinition[] {
    const disabledNames = new Set(
      this.#toolCapabilitySettingsService.snapshot().agentDisabledToolNames,
    );
    return this.#definitions.filter((definition) => !disabledNames.has(definition.name));
  }

  /** Builds the compact capability index disclosed before business Tool schemas. */
  #capabilityIndex(
    enabledDefinitions: readonly InterceptorToolDefinition[],
  ): string {
    const enabledCapabilityIds = new Set(
      enabledDefinitions.map((definition) => definition.capabilityId),
    );
    const capabilities = this.#catalog.listCapabilities()
      .filter((capability) => enabledCapabilityIds.has(capability.id));
    const lines = capabilities.map((capability) => (
      `- ${capability.id}: ${capability.description}`
    ));
    return [
      'Available Interceptor capabilities. Call discover_tools before using a product Tool.',
      ...lines,
    ].join('\n');
  }

  /** Builds the always-available progressive-discovery control Tool. */
  #discoverTool(): AgentTool {
    return defineTool({
      kind: 'query',
      name: DISCOVER_TOOLS_NAME,
      description: 'Discover enabled Interceptor product Tools in one capability.',
      inputSchema: z.object({
        capabilityId: z.string().min(1),
        query: z.string().min(1).optional(),
      }).strict(),
      execute: ({ capabilityId, query }) => ({
        matches: this.#discoverEnabled(capabilityId, query),
      }),
    });
  }

  /** Discovers only Tools that are both connected and currently enabled for Agent. */
  #discoverEnabled(capabilityId: string, query: string | undefined): readonly ToolDiscoveryMatch[] {
    const enabledNames = new Set(this.#enabledDefinitions().map((definition) => definition.name));
    return this.#catalog.discover({
      capabilityId,
      ...(query === undefined ? {} : { query }),
    }).filter((match) => enabledNames.has(match.descriptor.name));
  }

  /** Wraps one shared executor without duplicating its descriptor or argument behavior. */
  #agentTool(definition: InterceptorToolDefinition): AgentTool {
    const describeChange = definition.describeChange;
    return {
      kind: definition.kind,
      ...(definition.effectDescription === undefined
        ? {}
        : { effect: definition.effectDescription }),
      descriptor: {
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
      },
      ...(describeChange === undefined ? {} : {
        describeEffect: async (input, context) => {
          if (!isRecord(input)) {
            throw new ToolExecutionError(
              'invalid_arguments',
              `Invalid arguments for tool "${definition.name}".`,
            );
          }
          let changeDescription;
          try {
            changeDescription = await describeChange(input, {
              host: this.#interceptorToolHost,
              abortSignal: context.abortSignal,
            });
          } catch (error) {
            if (error instanceof InterceptorToolArgumentError) {
              throw new ToolExecutionError('invalid_arguments', error.message);
            }
            throw error;
          }
          return {
            text: [definition.effectDescription, ...changeDescription.lines]
              .filter((line): line is string => line !== undefined)
              .join('\n'),
            ...(changeDescription.metadata === undefined
              ? {}
              : { metadata: changeDescription.metadata }),
          };
        },
      }),
      execute: async (input, context): Promise<ToolExecutionResult> => {
        if (!this.#enabledDefinitions().some((candidate) => candidate.name === definition.name)) {
          return {
            ok: false,
            error: {
              code: 'unknown_tool',
              message: `Unknown tool "${definition.name}".`,
            },
          };
        }
        if (!isRecord(input)) {
          return invalidArguments(definition.name);
        }
        try {
          return {
            ok: true,
            value: await definition.execute(input, {
              host: this.#interceptorToolHost,
              abortSignal: context.abortSignal,
            }),
          };
        } catch (error) {
          if (error instanceof InterceptorToolArgumentError) {
            return invalidArguments(definition.name, error.message);
          }
          throw error;
        }
      },
    };
  }

  /** Derives disclosed names from successful, correlated discovery results in this Session. */
  #disclosedToolNames(messages: readonly AgentMessage[]): ReadonlySet<string> {
    const pendingCallIds = new Set<string>();
    const names = new Set<string>();
    for (const message of messages) {
      if (message.role === 'assistant') {
        for (const toolCall of message.toolCalls) {
          if (toolCall.name === DISCOVER_TOOLS_NAME) pendingCallIds.add(toolCall.id);
        }
        continue;
      }
      if (message.role !== 'tool'
        || message.name !== DISCOVER_TOOLS_NAME
        || !pendingCallIds.delete(message.toolCallId)) {
        continue;
      }
      for (const name of discoveredNames(message.content)) names.add(name);
    }
    return names;
  }
}

/** Returns whether untrusted Tool input is an object argument map. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Creates one stable model-correctable argument failure. */
function invalidArguments(name: string, detail?: string): ToolExecutionResult {
  return {
    ok: false,
    error: {
      code: 'invalid_arguments',
      message: detail ?? `Invalid arguments for tool "${name}".`,
    },
  };
}

/** Reads only Tool names from one successful discovery result. */
function discoveredNames(content: string): readonly string[] {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return [];
  }
  if (!isRecord(value) || value['ok'] !== true || !isRecord(value['value'])) return [];
  const matches = value['value']['matches'];
  if (!Array.isArray(matches)) return [];
  return matches.flatMap((match) => {
    if (!isRecord(match) || !isRecord(match['descriptor'])) return [];
    const name = match['descriptor']['name'];
    return typeof name === 'string' ? [name] : [];
  });
}
