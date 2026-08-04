import { stripXssiGuard } from '../bodyText';

export type JsonNodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
export interface JsonNode {
  /** JSONPath 形式的稳定标识，同时用于展开状态与 Copy path。 */
  path: string;
  depth: number;
  /** 对象键或数组下标；根节点没有键。 */
  label: string | null;
  isIndex: boolean;
  kind: JsonNodeKind;
  /** 叶子节点的原始值；容器为 undefined。 */
  value?: unknown;
  /** 容器的子项数。 */
  childCount: number;
  /** 容器的闭合行，只画一个括号。 */
  closing: boolean;
}

const ROOT_PATH = '$';

function kindOf(value: unknown): JsonNodeKind {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  switch (typeof value) {
    case 'object':
      return 'object';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

export function isContainer(kind: JsonNodeKind): boolean {
  return kind === 'object' || kind === 'array';
}

/** 默认展开根与第一层容器：再深就会把屏幕铺满，失去概览价值。 */
export function defaultExpanded(value: unknown): Set<string> {
  const expanded = new Set<string>();
  const walk = (current: unknown, path: string, depth: number): void => {
    if (!isContainer(kindOf(current)) || depth > 1) {
      return;
    }
    expanded.add(path);
    for (const [childLabel, child] of entriesOf(current)) {
      walk(child, childPath(path, childLabel, Array.isArray(current)), depth + 1);
    }
  };
  walk(value, ROOT_PATH, 0);
  return expanded;
}

function entriesOf(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }
  return Object.entries(value as Record<string, unknown>);
}

function childPath(parent: string, label: string, inArray: boolean): string {
  return inArray ? `${parent}[${label}]` : `${parent}.${label}`;
}

/** 把 JSON 展平成可虚拟化的行；折叠的子树不产生行。 */
export function flattenJson(value: unknown, expanded: Set<string>): JsonNode[] {
  const rows: JsonNode[] = [];
  const visit = (
    current: unknown,
    path: string,
    label: string | null,
    isIndex: boolean,
    depth: number,
  ): void => {
    const kind = kindOf(current);
    if (!isContainer(kind)) {
      rows.push({ path, depth, label, isIndex, kind, value: current, childCount: 0, closing: false });
      return;
    }
    const entries = entriesOf(current);
    rows.push({ path, depth, label, isIndex, kind, childCount: entries.length, closing: false });
    if (!expanded.has(path)) {
      return;
    }
    for (const [childLabel, child] of entries) {
      visit(child, childPath(path, childLabel, kind === 'array'), childLabel, kind === 'array', depth + 1);
    }
    rows.push({ path: `${path}/close`, depth, label: null, isIndex: false, kind, childCount: 0, closing: true });
  };
  visit(value, ROOT_PATH, null, false, 0);
  return rows;
}

/** 解析可展示为树的 JSON；非对象/数组根或解析失败返回 undefined，此时不提供 Tree 档。 */
export function parseJsonTree(text: string): unknown {
  const trimmed = stripXssiGuard(text).trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** 按 path 取回子树，供 Copy object / Copy value 使用。 */
export function valueAtPath(root: unknown, path: string): unknown {
  if (path === ROOT_PATH) {
    return root;
  }
  const steps = path.slice(ROOT_PATH.length).match(/\.[^.[\]]+|\[\d+\]/g) ?? [];
  let current: unknown = root;
  for (const step of steps) {
    const key = step.startsWith('[') ? step.slice(1, -1) : step.slice(1);
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
