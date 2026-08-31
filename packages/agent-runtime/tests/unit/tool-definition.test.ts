import { describe, expect, it } from 'vitest';
import { defineTool, ToolExecutionError, z } from '../../src';

const abortSignal = new AbortController().signal;

describe('defineTool', () => {
  it('returns an explicit tool execution error to the model', async () => {
    const unavailableTool = defineTool({
      kind: 'query',
      name: 'read_status',
      description: 'Read the current status.',
      inputSchema: z.object({}).strict(),
      execute: () => {
        throw new ToolExecutionError('service_unavailable', 'The status service is unavailable.');
      },
    });

    await expect(unavailableTool.execute({}, { abortSignal })).resolves.toEqual({
      ok: false,
      error: {
        code: 'service_unavailable',
        message: 'The status service is unavailable.',
      },
    });
  });

  it('propagates an unexpected tool implementation error', async () => {
    const unexpectedError = new Error('Database connection failed.');
    const brokenTool = defineTool({
      kind: 'query',
      name: 'read_status',
      description: 'Read the current status.',
      inputSchema: z.object({}).strict(),
      execute: () => {
        throw unexpectedError;
      },
    });

    await expect(brokenTool.execute({}, { abortSignal })).rejects.toBe(unexpectedError);
  });
});