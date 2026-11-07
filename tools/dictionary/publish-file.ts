import { readFile } from "node:fs/promises";
import { z } from "zod";
import { identifier } from "../../functions/src/shared/validation.js";
import { manifestSchema } from "./manifest.js";

const [file, project, expectedVersion, commandId, ...extra] =
  process.argv.slice(2);
if (!file || !project || !expectedVersion || !commandId || extra.length) {
  throw new Error(
    "Usage: tsx tools/dictionary/publish-file.ts <manifest> <project> <expected-config-version> <command-id>",
  );
}
const expected = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative())
  .parse(expectedVersion);
identifier.parse(commandId);
const manifest = manifestSchema.parse(JSON.parse(await readFile(file, "utf8")));
if (
  process.env.GCLOUD_PROJECT !== project ||
  process.env.GOOGLE_CLOUD_PROJECT !== project
) {
  throw new Error(
    "GCLOUD_PROJECT and GOOGLE_CLOUD_PROJECT must match the explicitly selected project.",
  );
}
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
const storageEmulator =
  process.env.STORAGE_EMULATOR_HOST ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (
  project.startsWith("demo-")
    ? !firestoreEmulator || !storageEmulator
    : !!firestoreEmulator || !!storageEmulator
) {
  throw new Error(
    "Demo publication requires both emulators. Live publication requires a live project and no emulator variables.",
  );
}
const { publishDictionaryManifest } = await import("./publish.js");
console.log(await publishDictionaryManifest(manifest, expected, commandId));
