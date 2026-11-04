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

## Follow-up review: module responsibilities

The reviewer made no production-code changes in this refactor and independently inspected the root, backend and admin agents' changes. The review assessed responsibility and control flow, rather than accepting smaller line counts as proof of improvement.

- The original service files are compatibility facades containing endpoint registries and worker exports. Operations now live in cohesive feature modules: draft/publication/import/configuration, vocabulary/study/rating/statistics, game preparation/rounds/results, AI start/send/ACK/end, report commands/queries/fix validation, and profile/avatar operations. They do not forward their former large implementation into one catch-all helper.
- Recomputed import/export dependency graphs contain no runtime or type-only cycles. Compatibility barrels do not create a dependency back from a feature into its own facade. Firebase initialization is confined to the backend runtime and frontend Firebase setup; domain modules have no transitive path to the backend initializer. The identified common domain values module's dependency on the broad core barrel was replaced by a narrow value-helper import. Review-plan calculation now accepts a Date instead of a Firebase Timestamp.
- Rating orchestration reads and validates the complete state before staging any writes, using the same transaction. The receipt wrapper still runs before stale-version validation. Import preview resolution remains read-only until the batch is staged; row application and final receipt publication retain their original transactions and resumable progress checks.
- AI repositories preserve request hashes, leases, READY/ACK transitions and receipt-before-version replay. Gemini calls and feedback collection remain outside retriable transaction callbacks. Reply caches remain process RAM; persisted records contain metadata and hashes, not message/context/reply bodies.
- Avatar byte decoding/upload is separated from activation. The adapter retains MIME, byte/pixel bounds, normalization and create-only Storage preconditions; the service retains owner, expiration, cleanup-lease and profile-version guards. Dictionary tooling separates manifest validation, staging and pointer commit while preserving immutable contents, checksum validation and publication CAS.
- Admin draft, import and report pages compose focused views and workflow hooks. Command payloads are captured before submission, dirty/unknown states and success callbacks are preserved, and retry/reload still uses the shared command journal. Provider state is separated into session, mutation and draft modules; shared models are separated by domain. Small local view handlers remain with their component where extraction would add indirection without separating a responsibility.

No actionable refactor regression was found in the reviewed local paths. No line-count, reflection or file-layout test was added: those would mirror this implementation rather than protect behavior. The existing behavioral suites provide the regression guard, and the root continues to review the reviewer-authored tests and Rules separately.

Post-refactor validation reported by the root on Node.js 22.23.4:

- Lint, strict typechecking for all workspaces/tools/tests, and both production builds passed.
- Unit tests: 19/19 passed.
- Full emulator regression: 66/66 passed in 76.46 seconds; local evidence `.local/refactor-emulator.log`.
- After the Date-only review-plan adjustment, learning regression: 10/10 passed in 10.59 seconds; local evidence `.local/refactor-learning.log`. Lint/typecheck/build and all 19 unit tests were rerun successfully.
- Browser regression: 3/3 passed in 39.1 seconds with exit code 0; local evidence `.local/refactor-browser.log`. The root confirmed that the local validation services were stopped afterward.

## Follow-up review: file naming

The independent reviewer made no file, test or Git changes in this pass. All 70 moves were reviewed against the previous commit and the documented naming convention. Exact filesystem-case resolution found no wrong-case or unresolved relative/dynamic imports; Git index paths match disk casing, including `Ui.tsx`. Component and hook filenames match their principal exports; context modules and the shared UI collection retain their intentional family names.

Public Callable, worker and service-facade export keys are unchanged. Independent normalized AST/token comparison found no unintended body changes; the `Topics` and `Limit` screen bodies match their former shared module. No retired filename references remain in the README, docs or review record. No actionable findings remained.

The root separately compared 194 TS/TSX source and test files, reviewed imports and the final diff, and verified lint, strict typecheck, clean Functions/Vite builds, 19/19 unit tests, 66/66 emulator tests (63.13 seconds), and 3/3 browser tests (40.6 seconds). Local evidence uses the `.local/naming-*` logs. Emulator and Vite listeners were checked after shutdown; none remained on their test ports.

## Follow-up review: backend layers

The main agent agreed the contracts and layer responsibilities before assigning learning/game and content/reports to separate agents. The independent reviewer made no production or Git changes. It authored the controller/middleware behavior tests; the main agent read and reviewed those tests separately. The reviewer assessed the other agents' and main agent's implementation and the main agent's new regression tests.

- Routes compose dependencies and register Callables; controllers parse strict input and invoke typed operations. Authentication/role guards and transport error mapping are explicit. Services/domain have no infrastructure imports or transitive Firebase runtime dependency. Feature transaction ports expose application reads/staged writes rather than SDK transactions or a generic CRUD framework.
- Service callbacks retain state, ownership, CAS, grading, SRS, source selection, import/publication, report/FIXED, AI turn/ending, deletion checkpoint and avatar cleanup decisions. SDK adapters perform queries, writes, provider value conversion and external I/O. The review specifically rejected leaving dictionary and avatar lifecycle policy hidden in old adapters; those decisions now live in domain/service modules.
- ACTIVE and receipt/hash replay precede stale-version validation within the same transaction. Reads precede staged writes. AI/Storage/image processing stays outside retriable callbacks. Workers retain checkpoint/lease fences, permanent/transient error classification and resume behavior. Reply/context content remains outside durable chat metadata and receipts.
- The reviewer found eager chat receipt decoding could replace COMMAND_REUSED with VALIDATION_FAILED when an ID belonged to another operation. The main agent fixed header-first/deferred receipt decoding, including unrelated IN_PROGRESS commands without receipts, and added real-emulator regressions for both start and end paths.
- The main agent's first full emulator run exposed Date/Timestamp differences between initial profile results and replayed receipts. The adapter now normalizes both paths; the existing receipt equality assertion remains in place and passes. Shared Timestamp conversion and SDK snapshot helpers were consolidated at the infrastructure boundary.
- Final independent graph/path review of 169 production modules found no unresolved or wrong-case imports, runtime/type-inclusive cycles, or service/domain infrastructure/runtime-provider dependencies. The existing legacy lexical `Data = DocumentData` alias remains the documented type-only exception. Public index exports match the original 84 endpoint/job names exactly, with the same six public-access Callables. No production backend source file exceeds 300 lines.

No review blocker remained at the final freeze. The root independently integrated the code, inspected the final callback/adapter boundaries and diff, and certified lint, strict backend/admin/tools/tests typecheck, both production builds, **71/71 unit tests**, **68/68 emulator tests** (63.17 seconds), and **3/3 browser tests** (38.2 seconds). Runtime evidence uses ignored `.local/layering-*` logs; no emulator/Vite listener remained after shutdown. Staging/production validation limits remain unchanged.
