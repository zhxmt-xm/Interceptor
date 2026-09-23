import { InterceptorToolArgumentError, rejectUnknownKeys, requireIntegerInRange } from '../arguments/entry';
import { PlatformOperationInProgressError } from './errors';
import type {
  InterceptorToolContext,
  InterceptorToolDefinition,
  MainToolResultPayloads,
} from '../interfaces';

const HOSTS_PROPERTY = {
  type: 'array' as const,
  description: 'Complete host list; an empty array clears only this list.',
  items: { type: 'string' as const, description: 'Host name or supported passthrough pattern.', minLength: 1 },
};

export function buildTlsTools(): readonly InterceptorToolDefinition[] {
  return [
    {
      ...change('settings_replace_tls_insecure_hosts', 'Replace insecure TLS hosts',
        'Replace hosts that skip upstream TLS certificate verification.'),
      inputSchema: { type: 'object', properties: { hosts: HOSTS_PROPERTY }, required: ['hosts'], additionalProperties: false },
      async describeChange(args, context) {
        const hosts = insecureHosts(args);
        const { payload } = await readTlsSettings(context, () => context.host.invoke(
          { type: 'tls.getInsecureHosts', payload: {} }, context.abortSignal,
        ));
        return {
          lines: [`Insecure host count: ${payload.hosts.length} -> ${hosts.length}`],
          metadata: { currentHostCount: payload.hosts.length, targetHostCount: hosts.length },
        };
      },
      async execute(args, context) {
        const hosts = insecureHosts(args);
        return executeTlsChange(context, async () => {
          const { payload } = await context.host.invokeMain({
            type: 'settings.tls-insecure-hosts.replace', payload: { hosts },
          }, context.abortSignal);
          return { hosts: payload.hosts };
        });
      },
    },
    {
      ...change('settings_replace_tls_passthrough', 'Replace TLS passthrough',
        'Replace TLS passthrough patterns at the current revision.'),
      inputSchema: {
        type: 'object',
        properties: { hosts: HOSTS_PROPERTY, expectedRevision: {
          type: 'integer', description: 'Current revision from settings_get_tls_passthrough.', minimum: 0,
        } },
        required: ['hosts', 'expectedRevision'], additionalProperties: false,
      },
      async describeChange(args, context) {
        const replacement = passthroughReplacement(args);
        const { payload } = await readTlsSettings(context, () => context.host.invoke(
          { type: 'tls-passthrough.get', payload: {} }, context.abortSignal,
        ));
        return {
          lines: [
            `Revision: ${replacement.expectedRevision}; current: ${payload.settings.revision}`,
            `Passthrough host count: ${payload.settings.hosts.length} -> ${replacement.hosts.length}`,
          ],
          metadata: { currentHostCount: payload.settings.hosts.length, targetHostCount: replacement.hosts.length,
            expectedRevision: replacement.expectedRevision, currentRevision: payload.settings.revision },
        };
      },
      async execute(args, context) {
        const replacement = passthroughReplacement(args);
        return executeTlsChange(context, async () => {
          const { payload } = await context.host.invokeMain({
            type: 'settings.tls-passthrough.replace', payload: replacement,
          }, context.abortSignal);
          if (!payload.ok) return {
            ok: false, reason: payload.reason,
            message: payload.reason === 'conflict'
              ? 'TLS settings changed; read the latest revision.' : 'Unable to replace TLS passthrough settings.',
          };
          return { ok: true, settings: { revision: payload.settings.revision, hosts: payload.settings.hosts } };
        });
      },
    },
    decryptionTool('settings_enable_https_decryption', 'Enable HTTPS decryption',
      'Enable HTTPS decryption when the existing Root CA is trusted.', 'settings.https-decryption.enable'),
    decryptionTool('settings_disable_https_decryption', 'Disable HTTPS decryption',
      'Disable HTTPS decryption without changing certificate trust.', 'settings.https-decryption.disable'),
  ];
}

function change(name: string, title: string, description: string) {
  return {
    name, title, description, effectDescription: description,
    capabilityId: 'settings', kind: 'change' as const, destructive: false, openWorld: false,
  };
}

function readHosts(args: Readonly<Record<string, unknown>>): string[] {
  if (!Array.isArray(args.hosts) || args.hosts.some((host) => typeof host !== 'string' || host.trim().length === 0)) {
    throw new InterceptorToolArgumentError('hosts must be an array of non-empty host strings.');
  }
  return args.hosts as string[];
}

function insecureHosts(args: Readonly<Record<string, unknown>>): string[] {
  rejectUnknownKeys(args, ['hosts']);
  return readHosts(args);
}

function passthroughReplacement(args: Readonly<Record<string, unknown>>) {
  rejectUnknownKeys(args, ['hosts', 'expectedRevision']);
  return {
    hosts: readHosts(args),
    expectedRevision: requireIntegerInRange(args, 'expectedRevision', { minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  };
}

function decryptionTool(
  name: string, title: string, description: string,
  command: 'settings.https-decryption.enable' | 'settings.https-decryption.disable',
): InterceptorToolDefinition {
  return {
    ...change(name, title, description),
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      const { payload } = await readTlsSettings(context, () => context.host.invokeMain(
        { type: 'settings.certificate.status', payload: {} }, context.abortSignal,
      ));
      return {
        lines: [`Root CA trusted: ${payload.trusted}`, `Decryption intent: ${payload.mitmEnabled}`],
        metadata: { trusted: payload.trusted, mitmEnabled: payload.mitmEnabled },
      };
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      return executeTlsChange(context, async () => {
        const { payload } = await context.host.invokeMain({ type: command, payload: {} }, context.abortSignal);
        return { ...publicCertificate(payload), decrypting: payload.decrypting };
      });
    },
  };
}

function publicCertificate(status: MainToolResultPayloads['settings.certificate.status']) {
  return {
    present: status.present, trusted: status.trusted, supported: status.supported, mitmEnabled: status.mitmEnabled,
    fingerprint: status.fingerprint, subject: status.subject, createdAt: status.createdAt, expiresAt: status.expiresAt,
  };
}

async function readTlsSettings<Result>(context: InterceptorToolContext, read: () => Promise<Result>): Promise<Result> {
  context.abortSignal.throwIfAborted();
  try {
    const result = await read();
    context.abortSignal.throwIfAborted();
    return result;
  } catch (error) {
    context.abortSignal.throwIfAborted();
    if (error instanceof PlatformOperationInProgressError) throw error;
    throw new Error('Unable to read TLS settings.');
  }
}

async function executeTlsChange(context: InterceptorToolContext, operation: () => Promise<unknown>): Promise<unknown> {
  context.abortSignal.throwIfAborted();
  try {
    const result = await operation();
    context.abortSignal.throwIfAborted();
    return result;
  } catch (error) {
    context.abortSignal.throwIfAborted();
    if (error instanceof PlatformOperationInProgressError) throw error;
    throw new Error('Unable to change TLS settings.');
  }
}