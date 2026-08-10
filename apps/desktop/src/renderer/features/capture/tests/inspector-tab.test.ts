import { describe, expect, it } from 'vitest';

import {
  INSPECTOR_TABS,
  TLS_TUNNEL_INSPECTOR_TABS,
} from '../constants';
import { isOriginCertificateError, retainInspectorTab } from '../utils';

describe('Inspector tab retention', () => {
  it('preserves a valid tab when selecting another request of the same type', () => {
    expect(retainInspectorTab('request', INSPECTOR_TABS, 'headers')).toBe('request');
    expect(retainInspectorTab('cookies', INSPECTOR_TABS, 'headers')).toBe('cookies');
  });

  it('falls back only when the selected request cannot display the current tab', () => {
    expect(retainInspectorTab('request', TLS_TUNNEL_INSPECTOR_TABS, 'tunnel'))
      .toBe('tunnel');
  });
});

describe('isOriginCertificateError', () => {
  it('offers the trust exception for failures a per-host override can fix', () => {
    expect(isOriginCertificateError('UNABLE_TO_VERIFY_LEAF_SIGNATURE')).toBe(true);
    expect(isOriginCertificateError('SELF_SIGNED_CERT_IN_CHAIN')).toBe(true);
    expect(isOriginCertificateError('CERT_HAS_EXPIRED')).toBe(true);
    expect(isOriginCertificateError('ERR_TLS_CERT_ALTNAME_INVALID')).toBe(true);
  });

  it('stays silent for failures that trusting the host would not fix', () => {
    expect(isOriginCertificateError('ECONNREFUSED')).toBe(false);
    expect(isOriginCertificateError('ENOTFOUND')).toBe(false);
    expect(isOriginCertificateError('EPROTO')).toBe(false);
    expect(isOriginCertificateError('ERR_LISTENER_REBUILD')).toBe(false);
    expect(isOriginCertificateError(undefined)).toBe(false);
  });
});