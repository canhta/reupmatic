/** Transport-safe error identity, shared by browser validation and the Node worker client. */
export class RemoteError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
