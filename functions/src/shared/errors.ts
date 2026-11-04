import { HttpsError } from "firebase-functions/v2/https";

/** Stable business codes remain separate from Firebase transport status codes. */
export function fail(code: string, message = code): never {
  const status =
    code === "CONFLICT" || code === "IMPORT_STALE"
      ? "aborted"
      : code === "UNAUTHENTICATED"
        ? "unauthenticated"
        : code === "PERMISSION_DENIED"
          ? "permission-denied"
          : code.endsWith("NOT_FOUND")
            ? "not-found"
            : code === "VALIDATION_FAILED" || code === "COMMAND_REUSED"
              ? "invalid-argument"
              : code.includes("LIMIT") || code === "RATE_LIMITED"
                ? "resource-exhausted"
                : "failed-precondition";
  throw new HttpsError(status, message, { code });
}
