import { rejectUnknownKeys } from '../arguments/entry';
import type { InterceptorToolContext, InterceptorToolDefinition, MainToolResultPayloads } from '../interfaces';

const CERTIFICATE_OPERATIONS = [
  { name: 'settings_generate_certificate', command: 'settings.certificate.generate', title: 'Generate Root CA',
    description: 'Generate or replace an untrusted Root CA without installing trust.', destructive: true },
  { name: 'settings_install_certificate', command: 'settings.certificate.install', title: 'Install Root CA',
    description: 'Install the existing Root CA for all users through native system authorization.', destructive: false },
  { name: 'settings_uninstall_certificate', command: 'settings.certificate.uninstall', title: 'Uninstall Root CA',
    description: 'Remove only the current Root CA from system trust without deleting its material.', destructive: false },
  { name: 'settings_delete_certificate', command: 'settings.certificate.delete', title: 'Delete Root CA',
    description: 'Uninstall any current Root CA trust, then delete its local certificate material.', destructive: true },
  { name: 'settings_reveal_certificate', command: 'settings.certificate.reveal', title: 'Reveal Root CA',
    description: 'Reveal the existing public Root CA in the system file manager.', destructive: false },
  { name: 'settings_view_certificate', command: 'settings.certificate.view', title: 'View Root CA',
    description: 'Open the existing public Root CA in the system certificate viewer.', destructive: false },
  { name: 'settings_open_certificate_manager', command: 'settings.certificate-manager.open', title: 'Open certificate manager',
    description: 'Open the system certificate manager without changing certificate trust.', destructive: false },
] as const;

export function buildCertificateTools(): readonly InterceptorToolDefinition[] {
  return CERTIFICATE_OPERATIONS.map((operation) => ({
    name: operation.name, title: operation.title, description: operation.description,
    effectDescription: operation.description, capabilityId: 'settings', kind: 'change',
    destructive: operation.destructive, openWorld: false,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async describeChange(args, context) {
      rejectUnknownKeys(args, []);
      return withCertificateError(context, 'Unable to read certificate state.', async () => {
        const { payload } = await context.host.invokeMain({ type: 'settings.certificate.status', payload: {} }, context.abortSignal);
        return {
          lines: [operation.title, `Root CA present: ${payload.present}`, `Root CA trusted: ${payload.trusted}`],
          metadata: {
            present: payload.present, trusted: payload.trusted, supported: payload.supported, mitmEnabled: payload.mitmEnabled,
          },
        };
      });
    },
    async execute(args, context) {
      rejectUnknownKeys(args, []);
      return withCertificateError(context, 'Unable to complete certificate operation.', async () => {
        const { payload } = await context.host.invokeMain({ type: operation.command, payload: {} }, context.abortSignal);
        if ('requested' in payload) return { requested: payload.requested };
        return publicCertificate(payload);
      });
    },
  }));
}

function publicCertificate(status: MainToolResultPayloads['settings.certificate.status']) {
  return {
    present: status.present, trusted: status.trusted, supported: status.supported, mitmEnabled: status.mitmEnabled,
    fingerprint: status.fingerprint, subject: status.subject, createdAt: status.createdAt, expiresAt: status.expiresAt,
  };
}

async function withCertificateError<Result>(
  context: InterceptorToolContext, message: string, operation: () => Promise<Result>,
): Promise<Result> {
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