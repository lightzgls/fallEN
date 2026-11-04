import {
  HttpsError,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";
import { ApplicationError } from "../shared/errors.js";

function transportCode(code: string): FunctionsErrorCode {
  if (code === "CONFLICT" || code === "IMPORT_STALE") return "aborted";
  if (code === "UNAUTHENTICATED") return "unauthenticated";
  if (code === "PERMISSION_DENIED") return "permission-denied";
  if (code.endsWith("NOT_FOUND")) return "not-found";
  if (code === "VALIDATION_FAILED" || code === "COMMAND_REUSED")
    return "invalid-argument";
  if (code.includes("LIMIT") || code === "RATE_LIMITED")
    return "resource-exhausted";
  return "failed-precondition";
}

export function callableError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof ApplicationError)
    return new HttpsError(
      transportCode(error.details.code),
      error.message,
      error.details,
    );
  return new HttpsError(
    "internal",
    "Không thể hoàn tất yêu cầu. Hãy kiểm tra trạng thái trước khi thử lại.",
    { code: "INTERNAL", retryable: true },
  );
}
