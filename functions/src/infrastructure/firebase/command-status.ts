import { z } from "zod";
import type { CommandStatusStore } from "../../contracts/commands.js";
import { assertActive } from "./access.js";
import { parse } from "../../shared/validation.js";
import { db } from "./runtime.js";
import { plainValue } from "./records.js";
const commandRecord = z.object({
  status: z.string(),
  receipt: z.unknown().optional(),
  error: z.unknown().optional(),
  progress: z.unknown().optional(),
});
export const commandStatusStore: CommandStatusStore = {
  assertActive,
  async read(actor, id) {
    const doc = await db.doc(`users/${actor.uid}/commands/${id}`).get();
    return doc.exists
      ? parse(commandRecord, plainValue(doc.data()))
      : undefined;
  },
};
