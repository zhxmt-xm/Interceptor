import type { BodyExportRequest } from '../../shared/desktop-api';

export type BodyExportTarget =
  | (BodyExportRequest & { readonly kind: 'body-reference' })
  | { readonly kind: 'exchange-body'; readonly exchangeId: string; readonly bodyId: string };