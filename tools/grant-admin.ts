import { getAuth } from "firebase-admin/auth";
import "../functions/src/shared/core.js";
const uid = process.argv[2];
if (!uid || !process.env.GCLOUD_PROJECT)
  throw new Error(
    "Usage: set GCLOUD_PROJECT and run tsx tools/grant-admin.ts <uid> [--revoke]. Uses operator ADC, never client self-registration.",
  );
const user = await getAuth().getUser(uid);
await getAuth().setCustomUserClaims(uid, {
  ...user.customClaims,
  contentAdmin: !process.argv.includes("--revoke"),
});
console.log(
  "Content admin claim updated. Refresh the Firebase ID token before using the admin.",
);
