import { describe, expect, it } from 'vitest';
import {
  InterceptorToolCatalog,
  type ToolCapability,
  type ToolDescriptor,
} from '../../src';

const capabilities: readonly ToolCapability[] = [
  {
    id: 'capture',
    title: 'Capture',
    description: 'Inspect captured HTTP, WebSocket, and gRPC traffic.',
  },
  {
    id: 'rules',
    title: 'Rules',
    description: 'Inspect and modify traffic rules.',
  },
];

const tools: readonly ToolDescriptor[] = [
  {
    name: 'capture_list_exchanges',
    title: 'List exchanges',
    description: 'List captured exchanges and response summaries.',
    capabilityId: 'capture',
    searchTerms: ['traffic', 'request'],
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'read_exchange_body',
    title: 'Read exchange body',
    description: 'Read a range from a captured request or response body.',
    capabilityId: 'capture',
    searchTerms: ['payload', 'content'],
    inputSchema: {
      type: 'object',
      properties: {
        exchangeId: { type: 'string' },
      },
      required: ['exchangeId'],
      additionalProperties: false,
    },
  },
  {
    name: 'rules_get_tree',
    title: 'Get rules',
    description: 'Return the current rule set.',
    capabilityId: 'rules',
    searchTerms: ['configuration'],
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

describe('InterceptorToolCatalog', () => {
  it('lists capability summaries without disclosing tool schemas', () => {
    const toolCatalog = new InterceptorToolCatalog(capabilities, tools);

    expect(toolCatalog.listCapabilities()).toEqual(capabilities);
    expect(toolCatalog.listCapabilities()[0]).not.toHaveProperty('tools');
    expect(toolCatalog.listCapabilities()[0]).not.toHaveProperty('inputSchema');
  });

  it('discovers full descriptors and explains lexical matches', () => {
    const toolCatalog = new InterceptorToolCatalog(capabilities, tools);

    expect(toolCatalog.discover({ capabilityId: 'capture', query: 'response body' })).toEqual([
      {
        capabilityId: 'capture',
        matchedTerms: ['response', 'body'],
        descriptor: tools[1],
      },
      {
        capabilityId: 'capture',
        matchedTerms: ['response'],
        descriptor: tools[0],
      },
    ]);
  });

  it('returns all tools in registration order when the query is empty', () => {
    const toolCatalog = new InterceptorToolCatalog(capabilities, tools);

    expect(toolCatalog.discover({ capabilityId: 'capture' }).map((match) => match.descriptor.name))
      .toEqual(['capture_list_exchanges', 'read_exchange_body']);
    expect(toolCatalog.discover({ capabilityId: 'missing' })).toEqual([]);
  });

  it('rejects duplicate capabilities, duplicate tools, and unknown capability ownership', () => {
    expect(() => new InterceptorToolCatalog(
      [...capabilities, capabilities[0]!],
      tools,
    )).toThrow('Duplicate capability "capture".');
    expect(() => new InterceptorToolCatalog(
      capabilities,
      [...tools, tools[0]!],
    )).toThrow('Duplicate tool "capture_list_exchanges".');
    expect(() => new InterceptorToolCatalog(capabilities, [{
      ...tools[0]!,
      capabilityId: 'missing',
    }])).toThrow('Tool "capture_list_exchanges" references unknown capability "missing".');
  });

  it('keeps immutable snapshots of capabilities, descriptors, and nested schemas', () => {
    const mutableCapability = {
      id: 'capture',
      title: 'Capture',
      description: 'Inspect traffic.',
    };
    const mutableSchema = {
      type: 'object',
      properties: {
        exchangeId: { type: 'string' },
      },
      additionalProperties: false,
    };
    const mutableTool = {
      name: 'capture_get_exchange',
      title: 'Get exchange',
      description: 'Return one captured exchange.',
      capabilityId: 'capture',
      searchTerms: ['traffic'],
      inputSchema: mutableSchema,
    };
    const toolCatalog = new InterceptorToolCatalog([mutableCapability], [mutableTool]);

    mutableCapability.title = 'Changed';
    mutableTool.name = 'changed_tool';
    mutableSchema.properties.exchangeId.type = 'number';

    expect(toolCatalog.listCapabilities()[0]?.title).toBe('Capture');
    const descriptor = toolCatalog.discover({ capabilityId: 'capture' })[0]?.descriptor;
    expect(descriptor).toMatchObject({
      name: 'capture_get_exchange',
      inputSchema: {
        properties: {
          exchangeId: { type: 'string' },
        },
      },
    });
    expect(() => {
      (descriptor as { name: string }).name = 'mutated_result';
    }).toThrow(TypeError);
    expect(() => {
      const schema = descriptor?.inputSchema as {
        properties: { exchangeId: { type: string } };
      };
      schema.properties.exchangeId.type = 'number';
    }).toThrow(TypeError);
    expect(toolCatalog.discover({ capabilityId: 'capture' })[0]?.descriptor.name)
      .toBe('capture_get_exchange');
  });
});