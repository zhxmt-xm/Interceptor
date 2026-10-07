/** 大小写保真的 HTTP header 集合。 */
export type HttpMessageHeaders = Record<string, string | string[] | undefined>;

/** 用户提供的 replacement body 来源。 */
export type HttpBodySource = 'text' | 'file';

/** 构造代理 replacement content bytes 所需的完整编辑事实。 */
export interface HttpBodyReplacementInput {
  readonly body: string | Uint8Array;
  readonly source: HttpBodySource;
  readonly originalHeaders: HttpMessageHeaders;
  readonly headers: HttpMessageHeaders;
  readonly editedHeaderNames: ReadonlySet<string>;
}

/** 已完成 content coding、可直接交给发送层的 replacement。 */
export interface PreparedHttpBodyReplacement {
  readonly content: Uint8Array;
  readonly headers: HttpMessageHeaders;
}
