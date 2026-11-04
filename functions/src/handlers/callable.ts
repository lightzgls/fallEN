import {
  onCall,
  HttpsError,
  type CallableOptions,
} from "firebase-functions/v2/https";
import { type Actor, serialize, fail } from "../shared/core.js";

export type Handler = (actor: Actor, input: unknown) => Promise<unknown>;
const publicMethods = new Set([
  "findWords",
  "getWord",
  "getWordVersion",
  "findConnections",
  "getPublishedDecks",
  "getDeletionStatus",
]);
export function callable(
  name: string,
  handler: Handler,
  options: CallableOptions = {},
) {
  return onCall(
    {
      region: process.env.FUNCTION_REGION || "asia-southeast1",
      maxInstances: Number(process.env.MAX_INSTANCES || 10),
      timeoutSeconds: 120,
      memory: "512MiB",
      enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
      cors: true,
      ...options,
    },
    async (request) => {
      if (!publicMethods.has(name) && !request.auth) fail("UNAUTHENTICATED");
      // SDK verifies token signatures. No user-controlled UID/role crosses the boundary.
      const actor: Actor = {
        uid: request.auth?.uid ?? "",
        contentAdmin: request.auth?.token.contentAdmin === true,
        authTime: Number(request.auth?.token.auth_time ?? 0),
      };
      try {
        return serialize(await handler(actor, request.data ?? {}));
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError(
          "internal",
          "Không thể hoàn tất yêu cầu. Hãy kiểm tra trạng thái trước khi thử lại.",
          { code: "INTERNAL", retryable: true },
        );
      }
    },
  );
}
