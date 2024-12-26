export class UnreachableError extends Error {
  constructor(_value: never, message?: string) {
    super(message);
  }
}
