import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) {
  // Tasks emulator needs an identity label, never a metadata-server credential lookup.
  initializeApp(
    process.env.FUNCTIONS_EMULATOR === "true"
      ? {
          serviceAccountId: `${process.env.GCLOUD_PROJECT || "demo-fallen"}@appspot.gserviceaccount.com`,
        }
      : undefined,
  );
}

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const storageBucketName =
  process.env.STORAGE_BUCKET ||
  `${process.env.GCLOUD_PROJECT || "demo-fallen"}.firebasestorage.app`;

export const bucket = getStorage().bucket(storageBucketName);
