import { controller } from "./controller.js";
import { commandStatusSchema } from "../contracts/commands.js";
import { requireUser } from "../middleware/auth.js";
import type { createCommandService } from "../services/commands.js";
export function createCommandControllers(
  service: ReturnType<typeof createCommandService>,
) {
  return {
    getCommandStatus: controller(
      commandStatusSchema,
      service.getCommandStatus,
      requireUser,
    ),
  };
}
