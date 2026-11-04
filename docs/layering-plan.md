# Backend responsibility boundaries

This refactor preserves all public Callable names, request/response schemas, paths, stored timestamps, errors, transaction ordering, idempotency and worker behavior in the source design. Internal boundaries are being made explicit.

## Agreed contracts

- `routes/<feature>.ts`: composition and Firebase Callable registration only. Compose a service with its concrete Firebase stores, create its controllers, and export public functions. `index.ts` only re-exports these functions and background jobs. Controller registries may be exported by the feature route for integration tests, but must not be re-exported by `index.ts`.
- `middleware/auth.ts`: verified-actor authentication and role guards. `middleware/errors.ts`: maps provider-independent `ApplicationError` into the unchanged `HttpsError` status/details. The Callable adapter owns SDK request/response handling, App Check and actor extraction. Account-state/ownership/version rules remain inside the appropriate transaction.
- `controllers/<feature>.ts`: typed input validation and dispatch. Use `controller(schema, operation, guard?)`; schemas live in cohesive `contracts/<feature>/` modules and services import their inferred input types only. A controller factory receives operations; it does not construct Firebase stores.
- `services/<feature>/`: business decisions and use-case coordination, with typed inputs and small consumer-specific store contracts under `contracts/<feature>/`. Export factories or functions accepting their stores explicitly. No Firebase imports, SDK document/query/transaction calls, or transport exceptions in services. Composition is done in route modules.
- `domain/`: pure calculations, state transitions and business value types. No Firebase or infrastructure dependencies.
- `infrastructure/<feature>/`: Firebase/Auth/Storage/Tasks/AI I/O, queries, cursor encoding requiring provider types, and transaction adapters implementing the feature store contracts. A store must not absorb the former service's business decisions into one renamed operation.

Prefer plain values and `Date` in new store contracts; convert Firestore Timestamp at adapter boundaries while preserving stored and Callable representations. Existing rich immutable dictionary data can retain its current shared type during this refactor; new contracts should describe the fields consumed instead of adding `any` or casts to suppress type errors. Do not build a generic CRUD framework or add interfaces with only forwarding methods and no useful boundary.

## Transaction invariants

The store executes the transaction and supplies a focused, operation-specific read/write context to the service callback. All reads and validations must precede staged writes. ACTIVE gate, receipt/hash replay, versions and state changes stay under the same transaction, with receipt replay preceding stale-version validation. No network/AI/Storage work is introduced into retried callbacks. Background workers retain leases, permanent/transient error classification and resume checkpoints.

## Ownership

- Root: foundation contracts/controller helper/middleware/Callable adapter, routes/index/jobs integration, dictionary/profile/deletion/chat features, shared helpers, test import integration, docs/Git and final checks.
- Backend agent: learning/game services, contracts/controllers/routes, and their feature infrastructure/domain changes. It may add independent feature unit tests under `tests/unit/learning-*` or `game-*` only.
- Admin agent (backend work for this pass): content/reports services, contracts/controllers/routes, and their feature infrastructure/domain changes. It may add feature unit tests under `tests/unit/content-*` or `report-*` only. No admin-web changes.
- Independent reviewer: read-only production review and new `tests/unit/controller.test.ts`, `tests/unit/middleware.test.ts` only. It does not approve its own test changes; root reviews them. No Git, installs or emulator runs by subagents. Shared files and cross-feature contract changes require coordination with root.
