/**
 * Summarizes one product capability without disclosing Tool schemas.
 * 概述一个产品能力，同时不披露 Tool schema。
 */
export interface ToolCapability {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Describes one transport-neutral Tool available for later disclosure.
 * 描述一个可在后续披露的 transport-neutral Tool。
 */
export interface ToolDescriptor {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly capabilityId: string;
  readonly searchTerms?: readonly string[];
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/**
 * Requests Tool discovery within one capability domain.
 * 请求在一个能力域内发现 Tool。
 */
export interface ToolDiscoveryQuery {
  readonly capabilityId: string;
  readonly query?: string;
}

/**
 * Returns one full descriptor together with explainable lexical matches.
 * 返回一份完整 descriptor 以及可解释的词项匹配结果。
 */
export interface ToolDiscoveryMatch {
  readonly capabilityId: string;
  readonly matchedTerms: readonly string[];
  readonly descriptor: ToolDescriptor;
}

/**
 * Owns immutable capability and Tool snapshots for deterministic discovery.
 * 拥有不可变的 capability 与 Tool 快照，保证 discovery 结果确定。
 */
export class InterceptorToolCatalog {
  /** Capability summaries in registration order. / 按注册顺序保存的能力摘要。 */
  readonly #capabilities: readonly ToolCapability[];
  /** Capability lookup used to validate Tool ownership. / 用于校验 Tool 所有权的能力索引。 */
  readonly #capabilitiesById: ReadonlyMap<string, ToolCapability>;
  /** Full Tool descriptors in stable registration order. / 按稳定注册顺序保存的完整 Tool descriptor。 */
  readonly #tools: readonly ToolDescriptor[];

  /**
   * Validates uniqueness and takes deep immutable snapshots of caller data.
   * 校验唯一性，并对调用方数据建立深层不可变快照。
   */
  constructor(
    capabilities: readonly ToolCapability[],
    tools: readonly ToolDescriptor[],
  ) {
    const capabilitySnapshots = capabilities.map(immutableSnapshot);
    const toolSnapshots = tools.map(immutableSnapshot);
    const capabilitiesById = new Map<string, ToolCapability>();
    for (const capability of capabilitySnapshots) {
      if (capabilitiesById.has(capability.id)) {
        throw new Error(`Duplicate capability "${capability.id}".`);
      }
      capabilitiesById.set(capability.id, capability);
    }

    const toolNames = new Set<string>();
    for (const tool of toolSnapshots) {
      if (toolNames.has(tool.name)) {
        throw new Error(`Duplicate tool "${tool.name}".`);
      }
      if (!capabilitiesById.has(tool.capabilityId)) {
        throw new Error(
          `Tool "${tool.name}" references unknown capability "${tool.capabilityId}".`,
        );
      }
      toolNames.add(tool.name);
    }

    this.#capabilities = Object.freeze(capabilitySnapshots);
    this.#capabilitiesById = capabilitiesById;
    this.#tools = Object.freeze(toolSnapshots);
  }

  /**
   * Returns only capability summaries for initial progressive disclosure.
   * 初始渐进式披露时只返回能力摘要。
   */
  listCapabilities(): readonly ToolCapability[] {
    return this.#capabilities;
  }

  /**
   * Returns matching full descriptors ordered by match count then registration order.
   * 按命中词数量、再按注册顺序返回匹配的完整 descriptor。
   */
  discover(query: ToolDiscoveryQuery): readonly ToolDiscoveryMatch[] {
    if (!this.#capabilitiesById.has(query.capabilityId)) {
      return [];
    }

    const queryTerms = normalizeQueryTerms(query.query);
    return Object.freeze(this.#tools
      .filter((tool) => tool.capabilityId === query.capabilityId)
      .map((descriptor, registrationIndex) => ({
        registrationIndex,
        match: Object.freeze({
          capabilityId: descriptor.capabilityId,
          matchedTerms: Object.freeze(matchingTerms(descriptor, queryTerms)),
          descriptor,
        }),
      }))
      .filter(({ match }) => queryTerms.length === 0 || match.matchedTerms.length > 0)
      .sort((left, right) => (
        right.match.matchedTerms.length - left.match.matchedTerms.length
        || left.registrationIndex - right.registrationIndex
      ))
      .map(({ match }) => match));
  }
}

/**
 * Clones and freezes caller-owned structured data before storing it.
 * 在保存调用方结构化数据前先复制并冻结。
 */
function immutableSnapshot<T>(value: T): T {
  return deepFreeze(structuredClone(value), new WeakSet<object>());
}

/**
 * Recursively freezes a structured clone while tolerating cyclic references.
 * 递归冻结结构化副本，同时兼容循环引用。
 */
function deepFreeze<T>(value: T, visited: WeakSet<object>): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (visited.has(value)) {
    return value;
  }
  visited.add(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue, visited);
  }
  return Object.freeze(value);
}

/**
 * Produces unique locale-independent query terms.
 * 生成去重且不受 locale 影响的查询词项。
 */
function normalizeQueryTerms(query: string | undefined): readonly string[] {
  if (query === undefined) {
    return [];
  }
  return [...new Set(query.toLowerCase().trim().split(/\s+/u).filter(Boolean))];
}

/**
 * Explains which query terms matched one Tool's searchable metadata.
 * 说明哪些查询词项命中了一个 Tool 的可搜索元数据。
 */
function matchingTerms(
  descriptor: ToolDescriptor,
  queryTerms: readonly string[],
): readonly string[] {
  const searchableText = [
    descriptor.name,
    descriptor.title,
    descriptor.description,
    ...(descriptor.searchTerms ?? []),
  ].join(' ').toLowerCase();
  return queryTerms.filter((term) => searchableText.includes(term));
}