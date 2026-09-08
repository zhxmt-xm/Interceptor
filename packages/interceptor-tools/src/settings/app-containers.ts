import { InterceptorToolArgumentError, rejectUnknownKeys, requireString } from '../arguments/entry';
import type { InterceptorToolContext, InterceptorToolDefinition, MainToolResultPayloads } from '../interfaces';

const OPERATIONS = [
  { name: 'settings_enable_app_container', command: 'settings.app-container.enable', single: true,
    title: 'Enable AppContainer access', description: 'Allow one AppContainer to access all local loopback services; this exemption persists after Interceptor exits.' },
  { name: 'settings_disable_app_container', command: 'settings.app-container.disable', single: true,
    title: 'Disable AppContainer access', description: 'Remove one AppContainer loopback exemption; this change persists after Interceptor exits.' },
  { name: 'settings_enable_all_app_containers', command: 'settings.app-containers.enable-all', single: false,
    title: 'Enable all AppContainers', description: 'Allow every currently listed AppContainer to access all local loopback services; preserve exemptions outside this list.' },
  { name: 'settings_disable_all_app_containers', command: 'settings.app-containers.disable-all', single: false,
    title: 'Disable all AppContainers', description: 'Remove loopback exemptions for every currently listed AppContainer; preserve exemptions outside this list.' },
] as const;

export function buildAppContainerTools(): readonly InterceptorToolDefinition[] {
  return OPERATIONS.map((operation): InterceptorToolDefinition => ({
    name: operation.name, title: operation.title, description: operation.description, effectDescription: operation.description,
    capabilityId: 'settings', kind: 'change', destructive: false, openWorld: false,
    inputSchema: operation.single ? {
      type: 'object', properties: { appContainerSid: { type: 'string', description: 'AppContainer SID from settings_list_app_containers.' } },
      required: ['appContainerSid'], additionalProperties: false,
    } : { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      const target = parseTarget(args, operation.single);
      return withAccessError(context, 'Unable to read AppContainer access.', async () => {
        const { payload } = await context.host.invokeMain({ type: 'settings.app-containers.list', payload: {} }, context.abortSignal);
        const containers = typeof target.appContainerSid === 'string'
          ? payload.containers.filter((container) => container.appContainerSid.toLowerCase() === target.appContainerSid!.toLowerCase())
          : payload.containers;
        const exemptCount = containers.filter((container) => container.exempt).length;
        return {
          lines: [`AppContainers affected: ${containers.length}`, `Currently exempt: ${exemptCount}`, 'Changes persist after Interceptor exits.'],
          metadata: { supported: payload.supported, targetCount: containers.length, exemptCount },
        };
      });
    },
    async execute(args, context) {
      const target = parseTarget(args, operation.single);
      return withAccessError(context, 'Unable to change AppContainer access.', async () => {
        const { payload } = await context.host.invokeMain({ type: operation.command, payload: target }, context.abortSignal);
        return publicSnapshot(payload);
      });
    },
  }));
}

function parseTarget(args: Readonly<Record<string, unknown>>, single: boolean): { appContainerSid: string } | Record<string, never> {
  rejectUnknownKeys(args, single ? ['appContainerSid'] : []);
  if (!single) return {};
  const appContainerSid = requireString(args, 'appContainerSid');
  if (!/^S-1-15-2-\d+(?:-\d+)*$/i.test(appContainerSid)) {
    throw new InterceptorToolArgumentError('appContainerSid must be an AppContainer SID.');
  }
  return { appContainerSid };
}

function publicSnapshot(snapshot: MainToolResultPayloads['settings.app-containers.list']) {
  return {
    supported: snapshot.supported,
    containers: snapshot.containers.map((container) => ({
      appContainerSid: container.appContainerSid, packageFamilyName: container.packageFamilyName,
      displayName: container.displayName, exempt: container.exempt,
    })),
  };
}

async function withAccessError<Result>(context: InterceptorToolContext, message: string, operation: () => Promise<Result>): Promise<Result> {
  context.abortSignal.throwIfAborted();
  try {
    const result = await operation();
    context.abortSignal.throwIfAborted();
    return result;
  } catch {
    context.abortSignal.throwIfAborted();
    throw new Error(message);
  }
}