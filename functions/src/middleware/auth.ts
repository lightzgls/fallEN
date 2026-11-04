import type { Actor } from "../contracts/callable.js";
import { fail } from "../shared/errors.js";
import { assertAdmin } from "../domain/account.js";

export function requireUser(actor: Actor): void {
  if (!actor.uid) fail("UNAUTHENTICATED");
}

export function requireAdmin(actor: Actor): void {
  requireUser(actor);
  assertAdmin(actor);
}
