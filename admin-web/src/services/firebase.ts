import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

const env = import.meta.env;
const demo = env.VITE_USE_EMULATORS === "true";
export const configurationError =
  !demo &&
  (!env.VITE_FIREBASE_API_KEY ||
    !env.VITE_FIREBASE_PROJECT_ID ||
    !env.VITE_APPCHECK_SITE_KEY)
    ? "Chưa có cấu hình Firebase hoặc App Check. Thiết lập .env.local theo .env.example trước khi kết nối."
    : undefined;
export const app = initializeApp({
  apiKey:
    env.VITE_FIREBASE_API_KEY ||
    (demo ? "demo-api-key" : "configuration-required"),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "demo-fallen.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "demo-fallen",
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET || "demo-fallen.firebasestorage.app",
  appId: env.VITE_FIREBASE_APP_ID || "demo-fallen-admin",
});
export const auth = getAuth(app);
export const functions = getFunctions(
  app,
  env.VITE_FUNCTIONS_REGION || "asia-southeast1",
);
export const storage = getStorage(app);
if (demo) {
  const host = env.VITE_EMULATOR_HOST || "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFunctionsEmulator(functions, host, 5001);
  connectStorageEmulator(storage, host, 9199);
} else if (env.VITE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
export const emulatorMode = demo;
