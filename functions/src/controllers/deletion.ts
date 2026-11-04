import { controller } from "./controller.js";
import {
  requestDeletionSchema,
  deletionStatusSchema,
} from "../contracts/deletion/requests.js";
import { requireUser } from "../middleware/auth.js";
import type { createDeletionService } from "../services/deletion.js";
export function createDeletionControllers(
  service: ReturnType<typeof createDeletionService>,
) {
  return {
    requestDeletion: controller(
      requestDeletionSchema,
      service.requestDeletion,
      requireUser,
    ),
    getDeletionStatus: controller(
      deletionStatusSchema,
      service.getDeletionStatus,
    ),
  };
}
