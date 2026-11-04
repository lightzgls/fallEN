import { controller } from "./controller.js";
import {
  empty,
  ensureProfileSchema,
  saveProfileSchema,
  beginAvatarSchema,
  finalizeAvatarSchema,
} from "../contracts/profile/requests.js";
import { requireUser } from "../middleware/auth.js";
import type { createProfileService } from "../services/profile.js";

export function createProfileControllers(
  service: ReturnType<typeof createProfileService>,
) {
  return {
    ensureProfile: controller(
      ensureProfileSchema,
      service.ensureProfile,
      requireUser,
    ),
    saveProfile: controller(
      saveProfileSchema,
      service.saveProfile,
      requireUser,
    ),
    beginAvatarUpload: controller(
      beginAvatarSchema,
      service.beginAvatarUpload,
      requireUser,
    ),
    finalizeAvatar: controller(
      finalizeAvatarSchema,
      service.finalizeAvatar,
      requireUser,
    ),
    getProfile: controller(empty, service.getProfile, requireUser),
    getAccess: controller(empty, service.getAccess, requireUser),
    getAccountState: controller(empty, service.getAccountState, requireUser),
    getDeletionInfo: controller(empty, service.getDeletionInfo, requireUser),
  };
}
