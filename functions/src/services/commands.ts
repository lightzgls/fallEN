import type { Actor } from "../contracts/callable.js";
import type {
  CommandStatusInput,
  CommandStatusStore,
} from "../contracts/commands.js";
export function createCommandService(store: CommandStatusStore) {
  return {
    async getCommandStatus(actor: Actor, input: CommandStatusInput) {
      await store.assertActive(actor);
      const document = await store.read(actor, input.commandId);
      return document
        ? {
            status: document.status,
            receipt: document.receipt,
            error: document.error,
            progress: document.progress,
          }
        : { status: "ABSENT" };
    },
  };
}
