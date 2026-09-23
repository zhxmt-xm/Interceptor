import { rejectUnknownKeys } from '../arguments/entry';
import { PlatformOperationInProgressError } from './errors';
import type {
  InterceptorToolContext,
  InterceptorToolDefinition,
  MainToolResultPayloads,
} from '../interfaces';

export function buildSystemProxyTools(): readonly InterceptorToolDefinition[] {
  return [
    defineSystemProxyChange(
      'settings_enable_system_proxy',
      'Enable system proxy',
      'Route system traffic through Interceptor using the active proxy listener.',
      async (context) => {
        const { payload } = await context.host.invokeMain({
          type: 'settings.system-proxy.enable', payload: {},
        }, context.abortSignal);
        return publicSystemProxyStatus(payload);
      },
    ),
    defineSystemProxyChange(
      'settings_restore_system_proxy',
      'Restore system proxy',
      'Restore the system proxy configuration saved before Interceptor took ownership.',
      async (context) => {
        const { payload } = await context.host.invokeMain({
          type: 'settings.system-proxy.restore', payload: {},
        }, context.abortSignal);
        return {
          restored: payload.restored,
          ...(payload.reason === undefined ? {} : { reason: payload.reason }),
          status: publicSystemProxyStatus(payload.status),
        };
      },
    ),
  ];
}

function publicSystemProxyStatus(
  status: MainToolResultPayloads['settings.system-proxy.status'],
): MainToolResultPayloads['settings.system-proxy.status'] {
  return {
    supported: status.supported,
    enabled: status.enabled,
    owned: status.owned,
    ownershipLost: status.ownershipLost,
    autoDetect: status.autoDetect,
    upstreamReachable: status.upstreamReachable,
  };
}

function defineSystemProxyChange(
  name: string,
  title: string,
  effectDescription: string,
  change: (context: InterceptorToolContext) => Promise<unknown>,
): InterceptorToolDefinition {
  return {
    name, title, description: effectDescription, effectDescription,
    capabilityId: 'settings', kind: 'change', destructive: false, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const { payload } = await context.host.invokeMain({
          type: 'settings.system-proxy.status', payload: {},
        }, context.abortSignal);
        context.abortSignal.throwIfAborted();
        return {
          lines: [
            `System proxy supported: ${payload.supported}`,
            `System proxy enabled: ${payload.enabled}`,
            `Owned by Interceptor: ${payload.owned}`,
          ],
          metadata: { supported: payload.supported, enabled: payload.enabled, owned: payload.owned },
        };
      } catch (error) {
        context.abortSignal.throwIfAborted();
        if (error instanceof PlatformOperationInProgressError) throw error;
        throw new Error('Unable to read system proxy state.');
      }
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      try {
        const result = await change(context);
        context.abortSignal.throwIfAborted();
        return result;
      } catch (error) {
        context.abortSignal.throwIfAborted();
        if (error instanceof PlatformOperationInProgressError) throw error;
        throw new Error('Unable to change system proxy state.');
      }
    },
  };
}