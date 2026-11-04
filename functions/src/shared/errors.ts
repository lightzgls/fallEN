export interface ValidationField {
  path: string;
  message: string;
}

/** Business failures are independent of the Callable transport. */
export class ApplicationError extends Error {
  readonly details: { code: string; fields?: ValidationField[] };

  constructor(code: string, message = code, fields?: ValidationField[]) {
    super(message);
    this.name = "ApplicationError";
    this.details = { code, ...(fields ? { fields } : {}) };
  }
}

export function fail(code: string, message = code): never {
  throw new ApplicationError(code, message);
}
