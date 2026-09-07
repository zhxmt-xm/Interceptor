import { InterceptorToolArgumentError, rejectUnknownKeys, requireString } from '../arguments/entry';
import type { InterceptorToolDefinition, MainToolPayloadForType } from '../interfaces';
import { redactTransferJob } from './utils';

export function buildBodyExportTool(): InterceptorToolDefinition {
  return {
    name: 'capture_export_body', title: 'Export captured body',
    description: 'Save a captured body in full through the native Save Dialog, without exposing body bytes or local file information.',
    effectDescription: 'Choose a destination and save the original stored body bytes; starting a file job does not mean it has completed.',
    capabilityId: 'capture', kind: 'change', destructive: false, openWorld: false,
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['exchangeId', 'bodyId'],
      properties: {
        exchangeId: { type: 'string', minLength: 1, description: 'Exchange identity from capture_get_exchange.' },
        bodyId: { type: 'string', minLength: 1, description: 'Body identity belonging to the selected exchange.' },
      },
    },
    async describeChange(args, context) {
      const identity = readBodyIdentity(args);
      context.abortSignal.throwIfAborted();
      const result = await context.host.invoke({
        type: 'sessions.detail', payload: { exchangeId: identity.exchangeId },
      }, context.abortSignal).catch(() => {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to read captured body metadata.');
      });
      context.abortSignal.throwIfAborted();
      const detail = result.payload.detail;
      const body = detail === null ? undefined : [
        detail.requestBody, detail.responseBody,
        detail.requestBodyEffect?.originalBody, detail.responseBodyEffect?.originalBody,
      ].find((reference) => reference?.bodyHash === identity.bodyId);
      if (body === undefined) throw new InterceptorToolArgumentError('The captured body is no longer available.');
      return {
        lines: [`Exchange: ${identity.exchangeId}`, `Body: ${identity.bodyId}`, `Stored bytes: ${body.encodedSize}`],
        metadata: { ...identity, encodedSize: body.encodedSize },
      };
    },
    async execute(args, context) {
      const identity = readBodyIdentity(args);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({ type: 'capture.body.export', payload: identity }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        if (payload.job === null) return { started: false };
        return { started: true, job: redactTransferJob(payload.job) };
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to export captured body.');
      }
    },
  };
}

function readBodyIdentity(args: Readonly<Record<string, unknown>>): MainToolPayloadForType<'capture.body.export'> {
  rejectUnknownKeys(args, ['exchangeId', 'bodyId']);
  const exchangeId = requireString(args, 'exchangeId');
  const bodyId = requireString(args, 'bodyId');
  if (exchangeId.trim().length === 0 || bodyId.trim().length === 0) {
    throw new InterceptorToolArgumentError('exchangeId and bodyId must be non-empty captured identities');
  }
  return { exchangeId, bodyId };
}