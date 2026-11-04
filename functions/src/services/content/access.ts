import { assertActive, assertAdmin, type Actor } from "../../shared/core.js";

export async function admin(actor: Actor) {
  assertAdmin(actor);
  await assertActive(actor);
}
