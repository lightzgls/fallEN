import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/emulator/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    restoreMocks: true,
    clearMocks: true,
    env: {
      GCLOUD_PROJECT: "demo-fallen",
      GOOGLE_CLOUD_PROJECT: "demo-fallen",
      FIREBASE_CONFIG: JSON.stringify({
        projectId: "demo-fallen",
        storageBucket: "demo-fallen.firebasestorage.app",
      }),
    },
  },
});
