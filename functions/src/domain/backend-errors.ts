import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

/** Only stable business failures finish a job. Transport and service failures remain retryable. */
export function businessErrorCode(error: unknown): string | undefined {
  if (!(error instanceof HttpsError)) return undefined;
  const result = z.object({ code: z.string() }).safeParse(error.details);
  return result.success ? result.data.code : undefined;
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
