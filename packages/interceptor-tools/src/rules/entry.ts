import {
  MAX_FOLDER_DEPTH,
  type RuleAction,
  type RuleDefinition,
  type RuleMatcher,
  type RuleNode,
} from '@interceptor/core-protocol';
import { z } from 'zod';

import { InterceptorToolArgumentError } from '../arguments/entry';
import { TOOL_PRESERVE_LOCAL_PATH } from '../constants';
import type { InterceptorToolJsonSchema } from '../interfaces';

const nonBlankString = z.string().refine((value) => value.trim().length > 0, {
  message: 'must not be blank',
});
const phaseSchema = z.enum(['request', 'response']);
const matchModeSchema = z.enum(['contains', 'exact', 'regex']);
const finiteNumberSchema = z.number().finite();

const ruleMatcherSchema = z.union([
  z.strictObject({
    type: z.literal('method'),
    value: nonBlankString,
  }),
  z.strictObject({
    type: z.literal('host'),
    value: nonBlankString,
    mode: matchModeSchema,
    caseSensitive: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('path'),
    value: nonBlankString,
    mode: matchModeSchema,
    caseSensitive: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('url'),
    value: nonBlankString,
    mode: matchModeSchema,
    caseSensitive: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('query'),
    key: nonBlankString,
    mode: matchModeSchema,
    value: z.string().optional(),
    caseSensitive: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('header'),
    phase: phaseSchema,
    name: nonBlankString,
    mode: matchModeSchema,
    value: z.string().optional(),
    caseSensitive: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('status'),
    min: finiteNumberSchema,
    max: finiteNumberSchema,
  }),
  z.strictObject({
    type: z.literal('mime'),
    phase: phaseSchema,
    value: nonBlankString,
  }),
]) as z.ZodType<RuleMatcher>;

const headerPairSchema = z.strictObject({
  name: z.string(),
  value: z.string(),
});

const ruleActionSchema = z.union([
  z.strictObject({
    type: z.literal('header'),
    phase: phaseSchema,
    op: z.enum(['set', 'append', 'remove']),
    name: nonBlankString,
    value: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('query'),
    op: z.enum(['set', 'remove']),
    name: nonBlankString,
    value: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('body'),
    phase: phaseSchema,
    format: z.enum(['text', 'json']),
    content: z.string(),
  }),
  z.strictObject({
    type: z.literal('synthetic'),
    statusCode: finiteNumberSchema,
    headers: z.array(headerPairSchema).optional(),
    body: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('map-local'),
    path: z.literal(TOOL_PRESERVE_LOCAL_PATH),
  }),
  z.strictObject({
    type: z.literal('map-remote'),
    scheme: z.enum(['http', 'https']).optional(),
    host: z.string().optional(),
    port: finiteNumberSchema.optional(),
    path: z.string().optional(),
  }).refine((action) => (
    action.scheme !== undefined
    || (action.host ?? '').trim() !== ''
    || action.port !== undefined
    || (action.path ?? '').trim() !== ''
  ), {
    message: 'map-remote requires a scheme, host, port, or path',
  }),
  z.strictObject({
    type: z.literal('block'),
    mode: z.enum(['reset', 'close']),
  }),
  z.strictObject({
    type: z.literal('status'),
    statusCode: finiteNumberSchema,
  }),
  z.strictObject({
    type: z.literal('delay'),
    phase: phaseSchema,
    ms: finiteNumberSchema,
  }),
  z.strictObject({
    type: z.literal('breakpoint'),
    phase: phaseSchema,
  }),
]) as z.ZodType<RuleAction>;

const ruleDefinitionSchema = z.strictObject({
  kind: z.literal('rule'),
  id: nonBlankString,
  name: nonBlankString,
  enabled: z.boolean(),
  priority: finiteNumberSchema,
  matchers: z.array(ruleMatcherSchema).min(1),
  actions: z.array(ruleActionSchema).min(1),
}) as z.ZodType<RuleDefinition>;

const ruleNodeSchema: z.ZodType<RuleNode> = z.lazy(() => z.union([
  ruleDefinitionSchema,
  z.strictObject({
    kind: z.literal('folder'),
    id: nonBlankString,
    name: nonBlankString,
    children: z.array(ruleNodeSchema),
  }),
]));

const ruleTreeSchema = z.array(ruleNodeSchema).superRefine((nodes, context) => {
  const nodeIds = new Set<string>();
  const visit = (node: RuleNode, folderDepth: number, path: PropertyKey[]): void => {
    if (nodeIds.has(node.id)) {
      context.addIssue({
        code: 'custom',
        path: [...path, 'id'],
        message: `duplicate node id "${node.id}"`,
      });
    }
    nodeIds.add(node.id);
    if (node.kind !== 'folder') return;
    const nextDepth = folderDepth + 1;
    if (nextDepth > MAX_FOLDER_DEPTH) {
      context.addIssue({
        code: 'custom',
        path,
        message: `folder depth must not exceed ${MAX_FOLDER_DEPTH}`,
      });
    }
    node.children.forEach((child, index) => visit(
      child,
      nextDepth,
      [...path, 'children', index],
    ));
  };
  nodes.forEach((node, index) => visit(node, 0, [index]));
});

const applyRulesArgumentsSchema = z.strictObject({
  baseRevision: z.number().int().min(0),
  nodes: ruleTreeSchema,
});

export const APPLY_RULES_INPUT_SCHEMA = z.toJSONSchema(
  applyRulesArgumentsSchema,
) as unknown as InterceptorToolJsonSchema;

/** Parses one complete untrusted Rule tree before any Core command is issued. */
export function parseRuleNodes(value: unknown): RuleNode[] {
  const parsed = ruleTreeSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.length ? ` at nodes.${issue.path.join('.')}` : '';
  throw new InterceptorToolArgumentError(
    `invalid Rule tree${path}: ${issue?.message ?? 'unknown validation error'}`,
  );
}

/** Redacts local file paths while preserving a round-trippable action marker. */
export function redactRuleNodesForTools(nodes: readonly RuleNode[]): RuleNode[] {
  return nodes.map((node): RuleNode => (
    node.kind === 'folder'
      ? { ...node, children: redactRuleNodesForTools(node.children) }
      : {
          ...node,
          actions: node.actions.map((action) => (
            action.type === 'map-local'
              ? { ...action, path: TOOL_PRESERVE_LOCAL_PATH }
              : action
          )),
        }
  ));
}

/** Compares JSON-compatible values without depending on object property order. */
function sameJsonValue(first: unknown, second: unknown): boolean {
  if (first === second) return true;
  if (Array.isArray(first) || Array.isArray(second)) {
    return Array.isArray(first)
      && Array.isArray(second)
      && first.length === second.length
      && first.every((value, index) => sameJsonValue(value, second[index]));
  }
  if (typeof first !== 'object' || first === null
    || typeof second !== 'object' || second === null) {
    return false;
  }
  const firstRecord = first as Readonly<Record<string, unknown>>;
  const secondRecord = second as Readonly<Record<string, unknown>>;
  const firstKeys = Object.keys(firstRecord);
  return firstKeys.length === Object.keys(secondRecord).length
    && firstKeys.every((key) => Object.hasOwn(secondRecord, key)
      && sameJsonValue(firstRecord[key], secondRecord[key]));
}

/** Restores Map Local paths only when the enclosing Rule remains unchanged. */
export function restorePreservedRuleLocalPaths(
  nodes: readonly RuleNode[],
  currentNodes: readonly RuleNode[],
): RuleNode[] {
  const currentRulesById = new Map<string, RuleDefinition>();
  const collectCurrentRules = (node: RuleNode): void => {
    if (node.kind === 'folder') {
      node.children.forEach(collectCurrentRules);
      return;
    }
    currentRulesById.set(node.id, node);
  };
  currentNodes.forEach(collectCurrentRules);

  const restore = (node: RuleNode): RuleNode => {
    if (node.kind === 'folder') {
      return { ...node, children: node.children.map(restore) };
    }
    const currentRule = currentRulesById.get(node.id);
    if (currentRule && node.actions.some((action) => action.type === 'map-local')) {
      const redactedCurrentRule = redactRuleNodesForTools([currentRule])[0];
      if (!sameJsonValue(node, redactedCurrentRule)) {
        throw new InterceptorToolArgumentError(
          `map-local paths on rule "${node.id}" can only be preserved while its Rule remains unchanged`,
        );
      }
    }
    return {
      ...node,
      actions: node.actions.map((action, index) => {
        if (action.type !== 'map-local') return action;
        const currentAction = currentRule?.actions[index];
        if (currentAction?.type !== 'map-local') {
          throw new InterceptorToolArgumentError(
            `map-local action ${index} on rule "${node.id}" can only preserve an existing path in place`,
          );
        }
        return { ...action, path: currentAction.path };
      }),
    };
  };
  return nodes.map(restore);
}
