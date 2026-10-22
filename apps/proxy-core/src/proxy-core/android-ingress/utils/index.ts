import { createHash, timingSafeEqual, X509Certificate } from 'node:crypto';

/** 校验canonical UUID，拒绝宽松解析或多余字符。 */
export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

/** 以固定长度比较身份摘要或授权值。 */
export function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 严格校验已确认的SPKI pin表示。 */
export function validPin(pin: string): boolean {
  if (!pin.startsWith('sha256/')) return false;
  const digest = pin.slice(7);
  const bytes = Buffer.from(digest, 'base64');
  return bytes.length === 32 && bytes.toString('base64') === digest;
}

/** 自签名设备身份按已确认SPKI及有效期授权，不依赖通用CA信任。 */
export function matchesDeviceIdentity(raw: Buffer | undefined, expectedPin: string): boolean {
  if (!raw) return false;
  const certificate = new X509Certificate(raw);
  const now = Date.now();
  if (now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) return false;
  const spki = certificate.publicKey.export({ type: 'spki', format: 'der' });
  const pin = `sha256/${createHash('sha256').update(spki).digest('base64')}`;
  return equalSecret(pin, expectedPin);
}

/** 仅接受协议定义的字段集合。 */
export function hasFields(message: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(message);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(message, field));
}
