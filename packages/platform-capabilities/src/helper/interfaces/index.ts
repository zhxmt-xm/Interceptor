import type { CommandRunner } from '../../interfaces';
import type { MacosSystemProxySnapshot } from '../../system-proxy/interfaces';

export interface HelperServiceOptions {
  readonly platform?: NodeJS.Platform;
  readonly applicationEnvironment?: 'production' | 'development';
  readonly nativeDirectory: string;
  readonly applicationPath?: string;
  readonly userId?: number;
}

export type MacosHelperDeploymentOptions = {
  readonly helperPath: string;
  readonly userId: number;
  readonly runner?: CommandRunner;
} & (
  | { readonly environment: 'production'; readonly applicationPath: string }
  | { readonly environment: 'development' }
);

export interface MacosApplicationIdentity {
  readonly bundleIdentifier: 'com.zhxmt.interceptor';
  readonly bundleVersion: string;
  readonly clientRequirement: string;
  readonly helperRequirement: string;
}

export interface MacosHelperServiceStatus {
  readonly processId: number;
  readonly privileged: boolean;
  readonly clientAuthorizedForWrites: boolean;
  readonly capabilities: readonly MacosHelperServiceOperation[];
}

export type MacosHelperServiceOperation =
  | 'status' | 'system-proxy.read' | 'system-proxy.read-effective' | 'system-proxy.read-discovery' | 'system-proxy.replace'
  | 'certificate.import' | 'certificate.remove' | 'request.get-completion';

export type MacosHelperRequestCompletion =
  | { readonly requestId: string; readonly state: 'unknown' }
  | {
    readonly requestId: string;
    readonly state: 'completed';
    readonly operation: 'system-proxy.replace' | 'certificate.import' | 'certificate.remove';
  };

export interface MacosCertificatePayload {
  readonly certificate: string;
  readonly sha256: string;
}

export type MacosHelperServiceRequest =
  | { readonly operation: 'status' | 'system-proxy.read' | 'system-proxy.read-effective' | 'system-proxy.read-discovery' }
  | {
    readonly operation: 'request.get-completion';
    readonly parameters: { readonly requestId: string };
  }
  | {
    readonly operation: 'certificate.import' | 'certificate.remove';
    readonly parameters: MacosCertificatePayload;
  }
  | {
    readonly operation: 'system-proxy.replace';
    readonly parameters: {
      readonly expectedSnapshot: MacosSystemProxySnapshot;
      readonly replacementSnapshot: MacosSystemProxySnapshot;
    };
  };

export type MacosHelperServiceErrorCode =
  | 'unavailable'
  | 'completion-unavailable'
  | 'timeout'
  | 'invalid-response'
  | 'unauthorized-client'
  | 'unsupported-operation'
  | 'protocol-mismatch'
  | 'invalid-request'
  | 'authorization-required'
  | 'authorization-cancelled'
  | 'certificate-state-uncertain'
  | 'snapshot-conflict'
  | 'operation-failed'
  | 'verification-failed';
