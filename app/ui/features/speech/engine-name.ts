export function engineName(runtime: string): string {
  const first = runtime.split(';')[0] ?? runtime;
  const at = first.indexOf('@');
  return at > 0 ? first.slice(0, at) : first;
}
