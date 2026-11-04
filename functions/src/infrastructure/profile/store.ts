import type { Transaction } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { Actor } from "../../contracts/callable.js";
import type {
  ProfileStore,
  ProfileTransaction,
} from "../../contracts/profile/store.js";
import { db, bucket } from "../firebase/runtime.js";
import { assertActive } from "../firebase/access.js";
import { command } from "../firebase/commands.js";
import { fail } from "../../shared/errors.js";
import { decodeAsset, decodeGate, decodeProfile } from "./codecs.js";
import { prepareAvatarImage } from "./avatar-image.js";
import { plainRecord } from "../firebase/records.js";

function context(actor: Actor, tx: Transaction, now: Date): ProfileTransaction {
  const user = db.doc(`users/${actor.uid}`),
    gate = db.doc(`accountStates/${actor.uid}`);
  const asset = (assetId: string) =>
    user.collection("profileAssets").doc(assetId);
  return {
    now,
    async readGate() {
      const doc = await tx.get(gate);
      return doc.exists ? decodeGate(doc.data()) : undefined;
    },
    async readProfile() {
      const doc = await tx.get(user);
      return doc.exists ? decodeProfile(doc.data()) : undefined;
    },
    async readAsset(assetId) {
      const doc = await tx.get(asset(assetId));
      return doc.exists ? decodeAsset(doc.data()) : undefined;
    },
    createProfile(profile, state) {
      tx.create(user, profile);
      tx.create(gate, state);
    },
    saveProfile(profile) {
      tx.set(user, profile);
    },
    createAsset(value) {
      tx.create(asset(value.assetId), value);
    },
    saveAsset(value) {
      tx.set(asset(value.assetId), value);
    },
    patchAsset(assetId, changes) {
      tx.update(asset(assetId), changes);
    },
  };
}
export const profileStore: ProfileStore = {
  now: () => new Date(),
  async authUser(uid) {
    const user = await getAuth().getUser(uid);
    return {
      disabled: user.disabled,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
  },
  assertActive,
  async readGate(actor) {
    const doc = await db.doc(`accountStates/${actor.uid}`).get();
    if (!doc.exists) fail("NOT_FOUND");
    return decodeGate(doc.data());
  },
  async readProfile(actor) {
    const doc = await db.doc(`users/${actor.uid}`).get();
    if (!doc.exists) fail("NOT_FOUND");
    return decodeProfile(doc.data());
  },
  async readAsset(actor, id) {
    const doc = await db.doc(`users/${actor.uid}/profileAssets/${id}`).get();
    if (!doc.exists) fail("NOT_FOUND");
    return decodeAsset(doc.data());
  },
  transaction(actor, active, work) {
    return db.runTransaction(async (tx) => {
      if (active) await assertActive(actor, tx);
      return work(context(actor, tx, new Date()));
    });
  },
  async command(actor, kind, input, work) {
    const receipt = await command(actor, kind, input, (tx, now) =>
      work(context(actor, tx, now.toDate())),
    );
    return plainRecord(receipt);
  },
  prepareImage: prepareAvatarImage,
  async avatarUrl(storagePath, expiresAt) {
    const emulator =
      process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
      process.env.STORAGE_EMULATOR_HOST;
    if (emulator) {
      const host = emulator.replace(/^https?:\/\//, "");
      const [metadata] = await bucket.file(storagePath).getMetadata();
      const token = metadata.metadata?.firebaseStorageDownloadTokens;
      return `http://${host}/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(String(token ?? ""))}`;
    }
    const [url] = await bucket
      .file(storagePath)
      .getSignedUrl({ action: "read", expires: expiresAt });
    return url;
  },
};
