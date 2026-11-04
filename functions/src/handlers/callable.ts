import { onCall, type CallableOptions } from "firebase-functions/v2/https";
import type { Actor, Controller } from "../contracts/callable.js";
import { serialize } from "../shared/values.js";
import { requireUser } from "../middleware/auth.js";
import { callableError } from "../middleware/errors.js";

export type Handler = Controller;
export type EndpointOptions = CallableOptions & {
  access?: "public" | "authenticated";
};
export function callable(
  _name: string,
  handler: Handler,
  options: EndpointOptions = {},
) {
  const { access = "authenticated", ...firebaseOptions } = options;
  return onCall(
    {
      region: process.env.FUNCTION_REGION || "asia-southeast1",
      maxInstances: Number(process.env.MAX_INSTANCES || 10),
      timeoutSeconds: 120,
      memory: "512MiB",
      enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
      cors: true,
      ...firebaseOptions,
    },
    async (request) => {
      // SDK verifies token signatures. No user-controlled UID/role crosses the boundary.
      const actor: Actor = {
        uid: request.auth?.uid ?? "",
        contentAdmin: request.auth?.token.contentAdmin === true,
        authTime: Number(request.auth?.token.auth_time ?? 0),
      };
      try {
        if (access === "authenticated") requireUser(actor);
        return serialize(await handler(actor, request.data ?? {}));
      } catch (error) {
        throw callableError(error);
      }
    },
  );
}
