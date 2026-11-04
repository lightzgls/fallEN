import { z } from "zod";
import { commandId } from "../shared/validation.js";
import type { Actor } from "./callable.js";
export const commandStatusSchema = z.object({ commandId }).strict();
export type CommandStatusInput = z.output<typeof commandStatusSchema>;
export interface CommandStatusRecord {
  status: string;
  receipt?: unknown;
  error?: unknown;
  progress?: unknown;
}
export interface CommandStatusStore {
  assertActive(actor: Actor): Promise<void>;
  read(
    actor: Actor,
    commandId: string,
  ): Promise<CommandStatusRecord | undefined>;
}
