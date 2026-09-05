import { rejectUnknownKeys } from '../arguments/entry';
import type { InterceptorToolContext, InterceptorToolDefinition } from '../interfaces';

export function buildSettingsQueryTools(): readonly InterceptorToolDefinition[] {
  return [
    query('settings_get_core_process_status', 'Core process status',
      'Read the Core process lifecycle, not listener or upstream health.', async (context) => {
        const { payload } = await context.host.invokeMain({
          type: 'settings.core-process.status', payload: {},
        }, context.abortSignal);
        return {
          state: payload.state, pid: payload.pid, restartCount: payload.restartCount,
          startedAt: payload.startedAt, lastHeartbeatAt: payload.lastHeartbeatAt,
          updatedAt: payload.updatedAt,
        };
      }),
    query('settings_get_system_proxy_status', 'System proxy status',
      'Read system proxy ownership and upstream reachability without raw OS configuration.', async (context) => {
        const { payload } = await context.host.invokeMain({
          type: 'settings.system-proxy.status', payload: {},
        }, context.abortSignal);
        return {
          supported: payload.supported, enabled: payload.enabled, owned: payload.owned,
          ownershipLost: payload.ownershipLost, autoDetect: payload.autoDetect,
          upstreamReachable: payload.upstreamReachable,
        };
      }),
    query('settings_get_certificate_status', 'Certificate status',
      'Read public Root CA identity, trust, and HTTPS decryption state without local paths.', async (context) => {
        const { payload } = await context.host.invokeMain({
          type: 'settings.certificate.status', payload: {},
        }, context.abortSignal);
        return {
          present: payload.present, trusted: payload.trusted, supported: payload.supported,
          mitmEnabled: payload.mitmEnabled, fingerprint: payload.fingerprint,
          subject: payload.subject, createdAt: payload.createdAt, expiresAt: payload.expiresAt,
        };
      }),
    query('settings_get_tls_insecure_hosts', 'Insecure TLS hosts',
      'Read configured hosts that skip upstream TLS certificate verification.', async (context) => {
        const { payload } = await context.host.invoke({
          type: 'tls.getInsecureHosts', payload: {},
        }, context.abortSignal);
        return { hosts: payload.hosts };
      }),
    query('settings_get_tls_passthrough', 'TLS passthrough settings',
      'Read TLS passthrough host patterns and their current revision.', async (context) => {
        const { payload } = await context.host.invoke({
          type: 'tls-passthrough.get', payload: {},
        }, context.abortSignal);
        return { revision: payload.settings.revision, hosts: payload.settings.hosts };
      }),
    query('settings_list_app_containers', 'AppContainer access',
      'Read supported Windows AppContainer identities and loopback exemption state.', async (context) => {
        const { payload } = await context.host.invokeMain({
          type: 'settings.app-containers.list', payload: {},
        }, context.abortSignal);
        return {
          supported: payload.supported,
          containers: payload.containers.map((container) => ({
            appContainerSid: container.appContainerSid, packageFamilyName: container.packageFamilyName,
            displayName: container.displayName, exempt: container.exempt,
          })),
        };
      }),
  ];
}

function query(
  name: string,
  title: string,
  description: string,
  read: (context: InterceptorToolContext) => Promise<unknown>,
): InterceptorToolDefinition {
  return {
    name, title, description, capabilityId: 'settings',
    kind: 'query', destructive: false, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      context.abortSignal.throwIfAborted();
      let result: unknown;
      try {
        result = await read(context);
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to read Settings state.');
      }
      context.abortSignal.throwIfAborted();
      return result;
    },
  };
}