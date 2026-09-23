import { test } from './local-electron-driver';
import { requireEmptySharedCertificateStore, rootCertificateThumbprints } from '../ui/https-capture';

export const certificateLifecycleTest = test.extend<{ certificateRootsBeforeStartup: string[] }>({
  allowSharedCertificateInitialization: true,
  certificateRootsBeforeStartup: [async ({}, use) => {
    await requireEmptySharedCertificateStore();
    await use(await rootCertificateThumbprints());
  }, { auto: true }],
});