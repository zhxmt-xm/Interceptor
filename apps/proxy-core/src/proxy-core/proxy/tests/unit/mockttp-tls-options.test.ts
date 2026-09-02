import { afterEach, describe, expect, it } from 'vitest';

import { getUpstreamTlsOptions } from 'mockttp/dist/rules/passthrough-handling';

const originalElectronVersion = Object.getOwnPropertyDescriptor(process.versions, 'electron');

/** Emulate one runtime without changing any TLS or network state. */
function setElectronVersion(version: string | undefined): void {
  if (version === undefined) {
    delete process.versions.electron;
    return;
  }
  Object.defineProperty(process.versions, 'electron', {
    configurable: true,
    enumerable: true,
    value: version,
  });
}

/** Build the non-strict upstream TLS options used for an explicit insecure host. */
function insecureHostTlsOptions(): ReturnType<typeof getUpstreamTlsOptions> {
  return getUpstreamTlsOptions({
    hostname: 'localhost',
    port: 443,
    ignoreHostHttpsErrors: ['localhost'],
    clientCertificateHostMap: {},
    trustedCAs: undefined,
    tryHttp2Upstream: true,
  });
}

afterEach(() => {
  if (originalElectronVersion === undefined) {
    delete process.versions.electron;
  } else {
    Object.defineProperty(process.versions, 'electron', originalElectronVersion);
  }
});

describe('Mockttp upstream TLS options', () => {
  it('omits the OpenSSL security-level command in Electron', () => {
    setElectronVersion('43.1.0');

    const options = insecureHostTlsOptions();

    expect(options.rejectUnauthorized).toBe(false);
    expect(options.ciphers).not.toContain('@SECLEVEL=0');
  });

  it('keeps the existing security-level downgrade in Node', () => {
    setElectronVersion(undefined);

    const options = insecureHostTlsOptions();

    expect(options.rejectUnauthorized).toBe(false);
    expect(options.ciphers).toContain('@SECLEVEL=0');
  });
});
