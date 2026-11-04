# fallEN Content Admin

React / TypeScript / Vite. All records are loaded from Firebase Callable Functions. The browser uses Firebase Authentication and only uploads files to grants issued by the backend. Content Admin is a separately provisioned custom claim; there is no admin registration flow.

Copy `.env.example` to `.env.local` and follow the repository README for emulators and seed. Start with `npm run dev` at the repository root. Production requires Firebase configuration and an App Check reCAPTCHA Enterprise site key. These Firebase client identifiers are public configuration; never put service-account or Gemini credentials in the browser.

Features are split by workflow: auth, dictionary selection, content drafts/material preview/publish, import preview/reconciliation, Speech, AI configuration and reports. SDK access lives in `src/services`; shared command recovery preserves command IDs and captured payloads in per-account, per-tab sessionStorage while the result is uncertain, including across reload. This journal contains admin command data, never passwords or AI messages, and clears on confirmed completion or logout for that account. The user must resolve an uncertain command before navigation. No Android UI or client-side Firestore writes are included.

Visual source: native Figma page `8:3`, screens W01–W10, W25 and W27–W33 in file `VrMB9EvgkVSZJNxe2pqLXz`, inspected 2026-11-04. Layout uses the live Inter typography, 228px navigation, 72px top bar, cobalt actions and Light/Dark semantic colors. Seven icon SVGs in `public/icons` are downloaded Figma assets. Cover and word images remain dynamic backend assets, resolved from asset IDs; no Figma temporary asset URL is referenced at runtime.

CSV/XLSX parsing and image/ZIP filename mapping happen in `services/import-files.ts` for preview UX; the server independently verifies rows and image bytes. Formula cells are rejected. ZIP directory sizes and paths are checked before decompression; bounded streaming enforces actual expansion limits and verifies CRC32 before assembling each image. Folder paths remain mapping keys while uploads use safe basenames. Missing source words must be corrected and previewed again or explicitly skipped.

`npm run typecheck -w admin-web` and `npm run build -w admin-web` run the browser checks. Repository Vitest includes `admin-web/tests`. The root lint configuration also covers this package.
