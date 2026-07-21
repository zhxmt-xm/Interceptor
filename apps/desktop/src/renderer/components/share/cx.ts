/** Join truthy class names — the shared className helper for all UI primitives. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
