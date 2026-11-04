import type { Actor } from "../contracts/callable.js";
import { fail } from "../shared/errors.js";

export function assertAdmin(actor: Actor): void {
  if (!actor.contentAdmin) fail("PERMISSION_DENIED");
}
export function assertActiveAccount(
  actor: Actor,
  state: { status?: string } | undefined,
): void {
  if (!actor.uid) fail("UNAUTHENTICATED");
  if (state?.status === "DELETING") fail("ACCOUNT_DELETING");
  if (state?.status !== "ACTIVE") fail("PROFILE_PENDING");
}
