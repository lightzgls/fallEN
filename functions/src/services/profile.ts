import type { Actor } from "../contracts/callable.js";
import type {
  BeginAvatarInput,
  EnsureProfileInput,
  FinalizeAvatarInput,
  SaveProfileInput,
} from "../contracts/profile/requests.js";
import type { ProfileStore } from "../contracts/profile/store.js";
import { ensureProfile, saveProfile } from "./profile/commands.js";
import {
  getProfile,
  getAccess,
  getAccountState,
  getDeletionInfo,
} from "./profile/queries.js";
import { beginAvatarUpload, finalizeAvatar } from "./profile/avatar.js";

export function createProfileService(store: ProfileStore) {
  return {
    ensureProfile: (actor: Actor, input: EnsureProfileInput) =>
      ensureProfile(actor, input, store),
    saveProfile: (actor: Actor, input: SaveProfileInput) =>
      saveProfile(actor, input, store),
    beginAvatarUpload: (actor: Actor, input: BeginAvatarInput) =>
      beginAvatarUpload(actor, input, store),
    finalizeAvatar: (actor: Actor, input: FinalizeAvatarInput) =>
      finalizeAvatar(actor, input, store),
    getProfile: (actor: Actor) => getProfile(actor, store),
    getAccess: (actor: Actor) => getAccess(actor, store),
    getAccountState: (actor: Actor) => getAccountState(actor, store),
    getDeletionInfo: (actor: Actor) => getDeletionInfo(actor, store),
  };
}
