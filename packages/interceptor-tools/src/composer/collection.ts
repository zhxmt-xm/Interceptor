import {
  collectLeaves,
  MAX_FOLDER_DEPTH,
  type Collection,
  type CollectionNode,
  type ComposerFieldRow,
} from '@interceptor/core-protocol';
import { z } from 'zod';

import { InterceptorToolArgumentError, rejectUnknownKeys, requireIntegerInRange } from '../arguments/entry';
import { TOOL_REDACTED_PLACEHOLDER } from '../constants';
import type { InterceptorToolContext, InterceptorToolDefinition, InterceptorToolJsonSchema } from '../interfaces';
import type { InterceptorToolRedactor } from '../redaction/entry';

const identity = z.string().min(1);
const fieldRowSchema = z.strictObject({ id: identity, name: z.string(), value: z.string(), enabled: z.boolean() });
const requestSchema = z.strictObject({
  kind: z.literal('request'), id: identity, name: identity, method: identity, url: z.string(),
  protocol: z.enum(['auto', 'http/1.1', 'h2']),
  query: z.array(fieldRowSchema), headers: z.array(fieldRowSchema), bodyForm: z.array(fieldRowSchema),
  bodyType: z.enum(['none', 'json', 'text', 'form']), bodyText: z.string(),
  auth: z.strictObject({ type: z.enum(['none', 'bearer', 'basic']), token: z.string(), username: z.string(), password: z.string() }),
});
const nodeSchema: z.ZodType<CollectionNode> = z.lazy(() => z.union([
  requestSchema,
  z.strictObject({ kind: z.literal('folder'), id: identity, name: identity, children: z.array(nodeSchema) }),
]));
const treeSchema = z.array(nodeSchema).superRefine((nodes, context) => {
  const nodeIds = new Set<string>();
  const visit = (node: CollectionNode, depth: number): void => {
    if (nodeIds.has(node.id)) context.addIssue({ code: 'custom', message: 'Duplicate Collection identity.' });
    nodeIds.add(node.id);
    if (node.kind === 'folder') {
      if (depth >= MAX_FOLDER_DEPTH) context.addIssue({ code: 'custom', message: 'Collection folder depth exceeded.' });
      for (const child of node.children) visit(child, depth + 1);
    } else {
      const rows = [...node.query, ...node.headers, ...node.bodyForm];
      if (new Set(rows.map((row) => row.id)).size !== rows.length) {
        context.addIssue({ code: 'custom', message: 'Duplicate request field identity.' });
      }
    }
  };
  for (const node of nodes) visit(node, 0);
});
const replacementSchema = z.strictObject({ baseRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), nodes: treeSchema });

export function buildCollectionTools(interceptorToolRedactor: InterceptorToolRedactor): readonly InterceptorToolDefinition[] {
  return [{
    name: 'composer_get_collection', title: 'Get Collection',
    description: 'Read the saved Composer Collection and revision with credentials redacted.',
    capabilityId: 'composer', kind: 'query', destructive: false, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      const collection = await readCollection(context);
      return { collection: { revision: collection.revision, nodes: redactNodes(collection.nodes, interceptorToolRedactor) } };
    },
  }, {
    name: 'composer_replace_collection', title: 'Replace Collection',
    description: 'Replace the saved Composer Collection with revision checking.',
    effectDescription: 'Replace the complete Collection without sending requests; preserve unchanged masked credentials.',
    capabilityId: 'composer', kind: 'change', destructive: false, openWorld: false,
    inputSchema: z.toJSONSchema(replacementSchema) as unknown as InterceptorToolJsonSchema,
    async describeChange(args, context) {
      const replacement = parseReplacement(args);
      const current = await readCurrentCollection(replacement.baseRevision, context);
      restoreNodes(replacement.nodes, current.nodes, interceptorToolRedactor);
      const beforeRequestCount = collectLeaves(current.nodes).length;
      const afterRequestCount = collectLeaves(replacement.nodes).length;
      const beforeFolderCount = countFolders(current.nodes);
      const afterFolderCount = countFolders(replacement.nodes);
      return {
        lines: [`Request count: ${beforeRequestCount} -> ${afterRequestCount}`, `Folder count: ${beforeFolderCount} -> ${afterFolderCount}`],
        metadata: { beforeRequestCount, afterRequestCount, beforeFolderCount, afterFolderCount },
      };
    },
    async execute(args, context) {
      const replacement = parseReplacement(args);
      const current = await readCurrentCollection(replacement.baseRevision, context);
      const nodes = restoreNodes(replacement.nodes, current.nodes, interceptorToolRedactor);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({
          type: 'composer.collection.replace', payload: { expectedRevision: replacement.baseRevision, nodes },
        }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return { revision: payload.revision };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to replace Collection.');
      }
    },
  }];
}

function parseReplacement(args: Readonly<Record<string, unknown>>): { baseRevision: number; nodes: CollectionNode[] } {
  rejectUnknownKeys(args, ['baseRevision', 'nodes']);
  const baseRevision = requireIntegerInRange(args, 'baseRevision', { minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
  const parsed = treeSchema.safeParse(args.nodes);
  if (!parsed.success) throw new InterceptorToolArgumentError('Invalid Collection tree.');
  return { baseRevision, nodes: parsed.data };
}

async function readCollection(context: InterceptorToolContext): Promise<Collection> {
  context.abortSignal.throwIfAborted();
  try {
    const { payload } = await context.host.invoke({ type: 'collection.get', payload: {} }, context.abortSignal);
    context.abortSignal.throwIfAborted();
    return payload.collection;
  } catch {
    context.abortSignal.throwIfAborted();
    throw new Error('Unable to read Collection.');
  }
}

async function readCurrentCollection(baseRevision: number, context: InterceptorToolContext): Promise<Collection> {
  const current = await readCollection(context);
  if (current.revision !== baseRevision) throw new InterceptorToolArgumentError('Collection changed; read the latest revision.');
  return current;
}

function countFolders(nodes: readonly CollectionNode[]): number {
  return nodes.reduce((count, node) => node.kind === 'folder' ? count + 1 + countFolders(node.children) : count, 0);
}

function redactUrl(value: string, interceptorToolRedactor: InterceptorToolRedactor): string {
  if (value === '') return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return TOOL_REDACTED_PLACEHOLDER;
    return interceptorToolRedactor.redactUrl(value);
  } catch {
    return TOOL_REDACTED_PLACEHOLDER;
  }
}

function redactNodes(nodes: readonly CollectionNode[], interceptorToolRedactor: InterceptorToolRedactor): CollectionNode[] {
  return nodes.map((node) => node.kind === 'folder'
    ? { ...node, children: redactNodes(node.children, interceptorToolRedactor) }
    : {
        ...node,
        url: redactUrl(node.url, interceptorToolRedactor),
        headers: interceptorToolRedactor.redactHeaders(node.headers),
        query: interceptorToolRedactor.redactQueryFields(node.query),
        bodyForm: interceptorToolRedactor.redactQueryFields(node.bodyForm),
        auth: {
          type: node.auth.type,
          token: node.auth.token === '' ? '' : TOOL_REDACTED_PLACEHOLDER,
          username: node.auth.username === '' ? '' : TOOL_REDACTED_PLACEHOLDER,
          password: node.auth.password === '' ? '' : TOOL_REDACTED_PLACEHOLDER,
        },
      });
}

function restoreSecret(next: string, current: string | undefined, redacted: string | undefined): string {
  if (next !== TOOL_REDACTED_PLACEHOLDER) return next;
  if (current === undefined || redacted !== TOOL_REDACTED_PLACEHOLDER) {
    throw new InterceptorToolArgumentError('Masked fields can only preserve their original values.');
  }
  return current;
}

function restoreRows(next: readonly ComposerFieldRow[], current: readonly ComposerFieldRow[], redacted: readonly ComposerFieldRow[]): ComposerFieldRow[] {
  return next.map((row) => {
    const original = current.find((entry) => entry.id === row.id && entry.name.toLowerCase() === row.name.toLowerCase());
    const masked = redacted.find((entry) => entry.id === row.id && entry.name.toLowerCase() === row.name.toLowerCase());
    return { ...row, value: restoreSecret(row.value, original?.value, masked?.value) };
  });
}

function restoreUrl(next: string, current: string | undefined, redacted: string | undefined): string {
  if (current !== undefined && next === redacted) return current;
  if (next === TOOL_REDACTED_PLACEHOLDER) return restoreSecret(next, current, redacted);
  let nextUrl: URL;
  try {
    nextUrl = new URL(next);
  } catch {
    if (next.includes(TOOL_REDACTED_PLACEHOLDER) || next.includes(encodeURIComponent(TOOL_REDACTED_PLACEHOLDER))) {
      throw new InterceptorToolArgumentError('Masked URL fields require an existing valid URL.');
    }
    return next;
  }
  let currentUrl: URL | undefined;
  let redactedUrl: URL | undefined;
  try {
    if (current !== undefined) currentUrl = new URL(current);
    if (redacted !== undefined) redactedUrl = new URL(redacted);
  } catch {
    currentUrl = undefined;
    redactedUrl = undefined;
  }
  let restored = false;
  for (const field of ['username', 'password'] as const) {
    const encodedPlaceholder = encodeURIComponent(TOOL_REDACTED_PLACEHOLDER);
    if (nextUrl[field] !== encodedPlaceholder) continue;
    nextUrl[field] = restoreSecret(TOOL_REDACTED_PLACEHOLDER, currentUrl?.[field], redactedUrl?.[field] === encodedPlaceholder ? TOOL_REDACTED_PLACEHOLDER : undefined);
    restored = true;
  }
  const query = new URLSearchParams();
  const occurrences = new Map<string, number>();
  for (const [name, value] of nextUrl.searchParams) {
    const index = occurrences.get(name) ?? 0;
    occurrences.set(name, index + 1);
    query.append(name, restoreSecret(value, currentUrl?.searchParams.getAll(name)[index], redactedUrl?.searchParams.get(name) ?? undefined));
    if (value === TOOL_REDACTED_PLACEHOLDER) restored = true;
  }
  if (!restored) return next;
  nextUrl.search = query.toString();
  return nextUrl.toString();
}

function restoreNodes(next: readonly CollectionNode[], current: readonly CollectionNode[], interceptorToolRedactor: InterceptorToolRedactor): CollectionNode[] {
  const currentRequests = new Map(collectLeaves(current).map((request) => [request.id, request]));
  const maskedRequests = new Map(collectLeaves(redactNodes(current, interceptorToolRedactor)).map((request) => [request.id, request]));
  const restore = (nodes: readonly CollectionNode[]): CollectionNode[] => nodes.map((node) => {
    if (node.kind === 'folder') return { ...node, children: restore(node.children) };
    const original = currentRequests.get(node.id);
    const masked = maskedRequests.get(node.id);
    return {
      ...node,
      url: restoreUrl(node.url, original?.url, masked?.url),
      headers: restoreRows(node.headers, original?.headers ?? [], masked?.headers ?? []),
      query: restoreRows(node.query, original?.query ?? [], masked?.query ?? []),
      bodyForm: restoreRows(node.bodyForm, original?.bodyForm ?? [], masked?.bodyForm ?? []),
      auth: {
        type: node.auth.type,
        token: restoreSecret(node.auth.token, original?.auth.token, masked?.auth.token),
        username: restoreSecret(node.auth.username, original?.auth.username, masked?.auth.username),
        password: restoreSecret(node.auth.password, original?.auth.password, masked?.auth.password),
      },
    };
  });
  return restore(next);
}