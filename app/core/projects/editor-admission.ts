export function isCurrentRevision(current: number, expected: number): boolean {
  return current === expected;
}

export function assertAdmitted(current: number, expected: number, busy: boolean): void {
  if (!isCurrentRevision(current, expected)) throw new Error('STALE_OPERATION');
  if (busy) throw new Error('EDITOR_BUSY');
}
