import { getAuth } from "firebase-admin/auth";
import { db, bucket } from "../firebase/runtime.js";
import { type Actor, type Data } from "../../shared/types.js";
import { requireDoc } from "../../shared/validation.js";
import { fail } from "../../shared/errors.js";
export async function readProfileView(actor: Actor): Promise<Data> {
  const user = requireDoc(await db.doc(`users/${actor.uid}`).get());
  let avatarSource: Data = { type: "Default" };
  if (user.avatarMode === "PROVIDER") {
    const auth = await getAuth().getUser(actor.uid);
    if (auth.photoURL?.startsWith("https://"))
      avatarSource = { type: "ProviderUrl", url: auth.photoURL };
  } else if (user.avatarMode === "CUSTOM") {
    const asset = requireDoc(
      await db
        .doc(`users/${actor.uid}/profileAssets/${user.avatarAssetId}`)
        .get(),
    );
    if (asset.state !== "ACTIVE" || asset.ownerUid !== actor.uid)
      fail("AVATAR_UNAVAILABLE");
    const expiresAt = Date.now() + 15 * 60_000;
    let url: string;
    if (
      process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
      process.env.STORAGE_EMULATOR_HOST
    ) {
      const host = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
        process.env.STORAGE_EMULATOR_HOST)!.replace(/^https?:\/\//, "");
      const [metadata] = await bucket.file(asset.storagePath).getMetadata();
      const token = metadata.metadata?.firebaseStorageDownloadTokens;
      url = `http://${host}/v0/b/${bucket.name}/o/${encodeURIComponent(asset.storagePath)}?alt=media&token=${encodeURIComponent(String(token ?? ""))}`;
    } else
      [url] = await bucket
        .file(asset.storagePath)
        .getSignedUrl({ action: "read", expires: expiresAt });
    avatarSource = {
      type: "OwnedAssetUrl",
      assetId: user.avatarAssetId,
      version: user.profileVersion,
      url,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
  return { user, avatarSource, profileVersion: user.profileVersion };
}
