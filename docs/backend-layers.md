# Backend layers and request flow

The backend uses Firebase Callable Functions with explicit internal layers. The public Callable names, request/response schemas, paths, stored timestamps, error codes, idempotency and worker behavior remain those defined in the source design.

## Responsibilities

- `routes/<feature>.ts`: composition and Firebase Callable registration. Compose a service with its concrete Firebase stores, create its controllers, and export public functions. `index.ts` only re-exports the 84 public functions and background jobs. Controller registries are exposed by feature routes for integration tests and are not re-exported by `index.ts`.
- `middleware/auth.ts`: verified-actor authentication and role guards. `middleware/errors.ts`: maps provider-independent `ApplicationError` into the unchanged `HttpsError` status/details. The Callable adapter owns SDK request/response handling, App Check and actor extraction. Account-state/ownership/version rules remain inside the appropriate transaction.
- `controllers/<feature>.ts`: typed input validation and dispatch. Use `controller(schema, operation, guard?)`; schemas live in cohesive `contracts/<feature>/` modules and services import their inferred input types only. A controller factory receives operations; it does not construct Firebase stores.
- `services/<feature>/`: business decisions and use-case coordination, with typed inputs and consumer-specific store contracts under `contracts/<feature>/`. Factories/functions accept their stores explicitly. Services have no Firebase imports, SDK document/query/transaction calls, or transport exceptions. Composition is done in route modules.
- `domain/`: pure calculations, state transitions and business value types. No Firebase or infrastructure dependencies.
- `infrastructure/<feature>/`: Firebase/Auth/Storage/Tasks/AI I/O, queries, cursor encoding requiring provider types, and transaction adapters implementing the feature store contracts. A store must not absorb the former service's business decisions into one renamed operation.

New store contracts use plain records and `Date`. `infrastructure/firebase/records.ts` converts Firestore Timestamp at adapter boundaries; stored values remain Timestamp and Callable JSON timestamps remain ISO strings. New record decoders validate stored data. Rich immutable lexical documents retain the existing legacy `Data` type alias; it is a type-only compatibility dependency, with no Firebase runtime initialization in service/domain code. New feature models describe their consumed fields. Ports are feature/operation-specific rather than a generic CRUD framework.

`shared/` contains provider-independent errors, validation and value helpers. Its `core.ts` is a compatibility barrel for operator tooling and integration fixtures and also exports Firebase adapters; application services and domain rules use narrow imports instead. Firebase account reads and receipt transactions live in `infrastructure/firebase/access.ts` and `commands.ts`.

## Transaction invariants

The store executes the transaction and supplies a focused, operation-specific read/write context to the service callback. All reads and validations must precede staged writes. ACTIVE gate, receipt/hash replay, versions and state changes stay under the same transaction, with receipt replay preceding stale-version validation. No network/AI/Storage work is introduced into retried callbacks. Background workers retain leases, permanent/transient error classification and resume checkpoints.

## Admin example: createDeck

1. The web Firebase SDK invokes `createDeck` with metadata and command ID. Firebase validates the supplied authentication token.
2. `routes/content.ts` registers the controller through `handlers/callable.ts`; the adapter constructs the verified actor, enforces authentication/App Check and maps results/errors.
3. `controllers/content.ts` applies the admin guard and strict input schema. The service receives parsed metadata, never a raw SDK request.
4. `services/content/drafts.ts` derives stable deck/revision IDs and coordinates creation through its draft transaction port.
5. `infrastructure/content/store.ts` runs the ACTIVE/receipt transaction and provides the focused read/write context. The service validates referenced assets and constructs the initial deck/draft state; the adapter stages the resulting writes and receipt atomically.
6. The Callable adapter serializes the result. Repeating the same command returns the original result; a different payload with that command ID is rejected before stale-version validation.

## Mobile example: saveRating

1. Android invokes `saveRating` with an event ID, session/word IDs, choice and expected versions.
2. `routes/learning.ts` selects the controller; the same Callable adapter authenticates the verified actor. The controller validates the strict rating schema.
3. `services/learning/rating.ts` coordinates a rating transaction and reads state through its narrow port. Receipt replay happens before version/state checks.
4. The service/domain verifies the pinned study source and independent versions, computes the SRS/memory/place outcome and activity aggregates, then asks the adapter to stage changes.
5. The Firestore adapter commits the rating, progress, schedule/place, aggregates and receipt together. Android receives the authoritative result. A retry with the same event ID and payload does not apply a second rating.

## Background work and tests

`handlers/jobs.ts` owns trigger/Task/Scheduler adapters. Route composition exposes the prepared game/import/publication/deletion/cleanup workers used by these triggers; only the intended six job exports appear in `index.ts`. Business checkpoint, lease, state and cleanup eligibility decisions remain in services. Gemini, image decoding and Storage access remain outside retriable transactions; chat reply/context text never enters durable metadata or receipts.

Unit tests inject focused stores to exercise business decisions without initializing Firebase. Controller/middleware tests check strict input validation, guard precedence and public error mapping. Emulator tests call the composed controllers with real Firebase stores, while browser tests invoke the actual Callable adapter. See [validation](validation.md) and the [independent review record](../tests/review-record.md).
