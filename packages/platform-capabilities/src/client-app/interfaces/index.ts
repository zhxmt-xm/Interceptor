/** Public icon notification; an unavailable icon remains null. */
export interface ClientAppIcon {
  clientAppId: string;
  icon: string | null;
}

export type ClientAppLookupRunner = (
  helperPath: string,
  args: readonly string[],
) => Promise<string>;
