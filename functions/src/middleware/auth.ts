import type { Actor } from "../contracts/callable.js";
import { fail } from "../shared/errors.js";

export function requireUser(actor: Actor): void {
  if (!actor.uid) fail("UNAUTHENTICATED");
}

export function requireAdmin(actor: Actor): void {
  requireUser(actor);
  if (!actor.contentAdmin) fail("PERMISSION_DENIED");
}
