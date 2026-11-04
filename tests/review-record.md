# Independent implementation review

Reviewer scope: code authored by the root, backend and admin agents. The reviewer authored the tests and Rules; those files require a separate root review and are not self-approved here.

Sources reviewed: all three current Google Docs tab snapshots, `docs/architecture.md`, and `fallen-design/system-architecture-2026-11-04/`. Acceptance checks use real Firestore/Auth/Storage emulators. A deterministic ChatApi substitutes only the external Gemini network boundary; quota/leases/ACK/summary persistence still use Firestore transactions.

## Corrections requested and rechecked

- Dictionary search filters inactive entries before stable pagination and pins one current release during a source read. Missing current entries do not erase saved words or inflate due counts. A retained old release cannot newly save a discontinued word.
- Chat candidates are selected in the start transaction from latest memory choices. Short learner messages cannot be copied verbatim into persisted feedback. End-context validation occurs before the ENDING lock. ACK replay precedes stale-version validation and never calls the provider.
- Deletion checkpoints, failure writes and completion use a lease owner fence so a superseded worker cannot regress or de-sanitize a COMPLETE job.
- Speech reports pin the actual speech version of the question and reject forged versions. A no-op speech version bump does not constitute a fix.
- Admin row resolution refreshes the full import preview rather than treating a single returned row as a preview. Correcting unknown spellings requires editing and previewing again. Folder paths from ZIP image mapping are preserved while uploaded filenames use their basename.
- ZIP directory bounds and bounded streaming extraction reject oversized entries before allocating their full expanded content. CRC validation runs incrementally during bounded extraction.
- Connection identity uses the endpoint/version/meaning/type tuple rather than provenance. Matching rounds require distinct meaning targets. A new revision, word version or row position alone does not prove that the reported learning content was fixed.
- Learners resolve image URLs only through a verified public release or published/retained deck reference. Private and draft assets are denied; returned learner metadata omits uploader IDs and storage paths. Retained deck defaults resolve from the pinned WordVersion, independently of the current dictionary release. Admin images prefer the backend-issued URL for shared and dictionary media.
- Avatar bytes must match their declared MIME type; finalization rechecks expiration before READY. Referenced ACTIVE assets are protected from cleanup.
- Query indexes cover actual optional report filters, delivered-turn ordering and import lock queries, rather than relying on emulator query permissiveness.
- Orphaned content locks have an explicit IAM/operator recovery command. It skips ACTIVE owners and preserves published content and already-applied import rows; it is separate from ordinary task retries.

## Validation evidence

The root performed the final integrated validation with Node.js 22.23.4 and Android Studio JBR 25:

- ESLint passed.
- Strict typechecking passed for Functions, admin, tools and tests.
- Functions and Vite production builds passed.
- Unit tests: 5 files, 19/19 passed.
- Emulator integration and Rules tests: 11 files, 66/66 passed in 56.61 seconds. Evidence: `.local/emulator-validation.log` (local, intentionally ignored by Git).
- Browser integration: final rerun 3/3 passed in 36.1 seconds using real Auth emulator and Callable requests, including selection/publication/reload, quota configuration, learner denial, and import with an explicitly skipped unknown word.

The root separately reviewed the reviewer-authored Rules, fixtures and tests. Storage overwrites are denied explicitly with `resource == null`; the final suite verifies this invariant. Image integration tests fetched actual PNG bytes from the resolved URL and verified private/draft denial.

These checks validate the local implementation. Live Gemini responses, production App Check, IAM, Cloud Tasks/Scheduler delivery and production deployment still require staging validation with the user's configured project and secrets. The open dictionary source/licensing decision D03 remains outside authored demo data. No production readiness or complete visual equivalence is inferred from emulator/browser results.
