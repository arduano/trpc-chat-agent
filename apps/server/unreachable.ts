export class UnreachableError extends Error {
  constructor(value: never, message?: string) {
    super(message);
  }
}
