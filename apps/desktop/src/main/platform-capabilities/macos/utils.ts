import type { MacosHelperServiceErrorCode, MacosHelperServiceOperation, MacosHelperServiceStatus, MacosSystemProxySnapshot } from '../interfaces';
import { MacosHelperServiceError, SystemProxyError } from '../internal/errors';

export function parseMacosHelperServiceReply(data: Uint8Array, requestId: string): unknown {
  const reply: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  if (!isRecord(reply) || reply.protocolVersion !== 1) throw new MacosHelperServiceError('invalid-response');
  if (reply.ok === false && hasFields(reply, ['protocolVersion', 'requestId', 'ok', 'error'])
    && isRecord(reply.error) && hasFields(reply.error, ['code'])) {
    const codes: readonly MacosHelperServiceErrorCode[] = [
      'unauthorized-client', 'unsupported-operation', 'protocol-mismatch', 'invalid-request',
      'authorization-required', 'authorization-cancelled', 'authorization-restoration-failed',
      'certificate-state-uncertain', 'snapshot-conflict', 'operation-failed', 'verification-failed',
    ];
    if ((reply.requestId === requestId || (reply.requestId === null && reply.error.code === 'unauthorized-client'))
      && codes.includes(reply.error.code as MacosHelperServiceErrorCode)) {
      throw new MacosHelperServiceError(reply.error.code as MacosHelperServiceErrorCode);
    }
  }
  if (reply.ok !== true || reply.requestId !== requestId
    || !hasFields(reply, ['protocolVersion', 'requestId', 'ok', 'value'])) {
    throw new MacosHelperServiceError('invalid-response');
  }
  return reply.value;
}

export function parseMacosHelperServiceStatus(value: unknown): MacosHelperServiceStatus {
  const capabilities: readonly MacosHelperServiceOperation[] = [
    'status', 'system-proxy.read', 'system-proxy.read-effective', 'system-proxy.replace',
    'certificate.import', 'certificate.remove', 'certificate.trust', 'certificate.untrust',
  ];
  const reportedCapabilities = isRecord(value) ? value.capabilities : undefined;
  if (!isRecord(value) || !hasFields(value, ['processId', 'privileged', 'clientAuthorizedForWrites', 'capabilities'])
    || typeof value.processId !== 'number' || !Number.isSafeInteger(value.processId) || value.processId <= 0
    || typeof value.privileged !== 'boolean' || typeof value.clientAuthorizedForWrites !== 'boolean'
    || !Array.isArray(reportedCapabilities)
    || reportedCapabilities.length !== capabilities.length
    || !capabilities.every((capability) => reportedCapabilities.includes(capability))) {
    throw new MacosHelperServiceError('invalid-response');
  }
  return { processId: value.processId, privileged: value.privileged, clientAuthorizedForWrites: value.clientAuthorizedForWrites, capabilities };
}

export function parseMacosSystemProxySnapshot(value: unknown): MacosSystemProxySnapshot {
  if (typeof value !== 'object' || value === null) {
    throw new SystemProxyError('macOS proxy snapshot must be an object.');
  }
  const services = (value as Record<string, unknown>).services;
  if (!Array.isArray(services)) {
    throw new SystemProxyError('macOS proxy snapshot has invalid services.');
  }

  const identifiers = new Set<string>();
  const parsed = services.map((service) => {
    if (typeof service !== 'object' || service === null) {
      throw new SystemProxyError('macOS network service must be an object.');
    }
    const record = service as Record<string, unknown>;
    if (
      typeof record.id !== 'string' || record.id.length === 0 || typeof record.name !== 'string'
      || typeof record.settings !== 'object' || record.settings === null || Array.isArray(record.settings)
    ) {
      throw new SystemProxyError('macOS network service fields are invalid.');
    }
    if (identifiers.has(record.id)) {
      throw new SystemProxyError('macOS proxy snapshot has duplicate services.');
    }
    identifiers.add(record.id);
    assertJsonValue(record.settings);
    return { id: record.id, name: record.name, settings: record.settings as Record<string, unknown> };
  });
  parsed.sort((left, right) => left.id.localeCompare(right.id));
  return { services: parsed };
}

export function parseMacosEffectiveProxySettings(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new MacosHelperServiceError('invalid-response');
  try {
    assertJsonValue(value);
  } catch {
    throw new MacosHelperServiceError('invalid-response');
  }
  return value;
}

function assertJsonValue(value: unknown): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))) return;
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item);
    return;
  }
  if (typeof value === 'object') {
    for (const [, item] of Object.entries(value as Record<string, unknown>)) assertJsonValue(item);
    return;
  }
  throw new SystemProxyError('macOS proxy snapshot contains an invalid value.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}