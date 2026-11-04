import { ApplicationError } from "../shared/errors.js";

/** Only stable business failures finish a job. Transport and service failures remain retryable. */
export function businessErrorCode(error: unknown): string | undefined {
  return error instanceof ApplicationError ? error.details.code : undefined;
}

export function isPermanentJobFailure(code: string | undefined): boolean {
  return (
    code !== undefined &&
    [
      "VALIDATION_FAILED",
      "CONFLICT",
      "IMPORT_STALE",
      "ASSET_NOT_FOUND",
      "WORD_NOT_FOUND",
      "SOURCE_INVALID",
      "INSUFFICIENT_GAME_SOURCE",
      "SOURCE_EXHAUSTED",
      "DECK_UNAVAILABLE",
      "ACCOUNT_DELETING",
      "PAYLOAD_LIMIT",
    ].includes(code)
  );
}
