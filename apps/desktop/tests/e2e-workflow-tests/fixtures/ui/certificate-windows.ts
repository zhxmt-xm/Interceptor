import {
  closeCertificateWindow as closeWindowsCertificateWindow,
  listCertificateWindows as listWindowsCertificateWindows,
  verifyAndCloseCertificateWindow as verifyAndCloseWindowsCertificateWindow,
  type CertificateWindow as WindowsCertificateWindow,
} from './windows-certificate-windows';
import {
  closeMacosCertificateWindow,
  listMacosCertificateWindows,
  verifyAndCloseMacosCertificateWindow,
  type MacosCertificateWindow,
} from './macos-certificate-windows';

export type CertificateWindow = WindowsCertificateWindow | MacosCertificateWindow;

export function listCertificateWindows(certificateDirectory: string): Promise<CertificateWindow[]> {
  switch (process.platform) {
    case 'win32': return listWindowsCertificateWindows(certificateDirectory);
    case 'darwin': return listMacosCertificateWindows(certificateDirectory);
    default: throw new Error(`Native certificate windows are unsupported on ${process.platform}.`);
  }
}

export function closeCertificateWindow(window: CertificateWindow): Promise<void> {
  switch (process.platform) {
    case 'win32': return closeWindowsCertificateWindow(window as WindowsCertificateWindow);
    case 'darwin': return closeMacosCertificateWindow(window as MacosCertificateWindow);
    default: throw new Error(`Native certificate windows are unsupported on ${process.platform}.`);
  }
}

export function verifyAndCloseCertificateWindow(
  kind: CertificateWindow['kind'], before: readonly CertificateWindow[], certificateDirectory: string,
  ownedWindows: CertificateWindow[],
): Promise<void> {
  switch (process.platform) {
    case 'win32':
      return verifyAndCloseWindowsCertificateWindow(
        kind, before as readonly WindowsCertificateWindow[], certificateDirectory, ownedWindows as WindowsCertificateWindow[],
      );
    case 'darwin':
      return verifyAndCloseMacosCertificateWindow(
        kind, before as readonly MacosCertificateWindow[], certificateDirectory, ownedWindows as MacosCertificateWindow[],
      );
    default: throw new Error(`Native certificate windows are unsupported on ${process.platform}.`);
  }
}