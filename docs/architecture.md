# fallEN implementation contract — 2026-11-04

Authoritative sources: [Google Docs](https://docs.google.com/document/d/1iD8oRNJU4i1mLWCdE6QwtJySV2NPL4uji6JupZnXjVE/edit), all three tabs, revision `AHj4eMSa1m3pWWtkkoRPqfou4RX934k3GuMOUPqzxyZ3xrbmsz5iZWUm6jWed-u9aDaliGMEoa9OYKjVUlXcTvQDhSRVoLimGT6K_PKasII`; `../fallen-design/system-architecture-2026-11-04/`; [Figma](https://www.figma.com/design/VrMB9EvgkVSZJNxe2pqLXz). Live source snapshots are in the parent workspace as `fallen-source-main.txt`, `fallen-source-scenario-design.txt`, `fallen-source-plantuml.txt` for implementation review. Native Figma supersedes old preview PNGs.

## Fixed decisions

- Firebase Functions gen2, Node 22 / TypeScript; Firebase Auth, Firestore, Storage, App Check, Cloud Tasks, Scheduler for avatar GC only. Admin React/TS/Vite on Hosting. No Android UI, notifications backend, alternate DB, or transcript storage.
- Separate DictionaryRelease, immutable WordVersion and DeckRevision. Canonical wordId across aliases and all save sources. D03 dictionary licensing remains open: authored demo data only; provider model deployment-configured, no automatic paid fallback.
- Callable names follow the source Store methods. Input never supplies UID/role/score. Strict Zod schemas reject unknown keys. Service checks verified UID, contentAdmin claim, ACTIVE gate, owner and independent expected versions.
- Mutations carry commandId (ratings eventId; turns turnId). Receipt and hash are persisted atomically with state. Same ID/different payload is invalid. Receipt lookup precedes stale-version validation. No network/AI/Storage work in retried transaction callbacks.
- Stored timestamps use Firestore Timestamp; Callable JSON uses ISO strings. Calendar day keys use Asia/Ho_Chi_Minh. Personal write data is server-only. Auth/passwords remain Firebase SDK concerns.
- Personal paths: users/{uid}/{personalWords,wordProgress,srsSchedules,studySessions,assessmentEvents,flashcardPositions,learningDays,deckActivity,dashboard,gameSessions,aiDailyUsage,aiSessions,aiSummaries,commands,profileAssets}. Root accountStates, accountDeletionJobs and contentReports/actions. No server search history/settings/widget collections.
- Lexical paths: words/{wordId}/versions/{version}, words/{wordId} for operational speech, dictionaryReleases/{releaseId}/{entries,keys,connections}; config/dictionary.activeReleaseId. Search uses checksum-verified immutable Storage index, not Firestore fuzzy queries. Requests/cursors pin public release.
- Content: systemDecks/{id}/revisions/{id}/words/{wordId}, contentImports/{id}/rows/{id}, imageAssets, aiScenarios, config/ai. Admin cannot mutate lexical content. Metadata projection changes only on publish. Publish DRAFT→VALIDATING→PUBLISHED under CAS lock, pointer atomic; resumable workers.
- SRS levels 1/3/7/14/30 calendar days. Save creates level1 tomorrow; active duplicate keeps schedule; remove deletes schedule atomically, retains WordMemory/history; resave creates new cycle. Flashcard NOT_REMEMBERED auto-saves only if absent, REMEMBERED never auto-saves. Rating validates memory plus branch-specific plan/cycle/membership or place versions.
- Game immutable source/WordCopy, server grades first answers. PREPARING then ACTIVE. Match exactly5 pairs, listen1. Only committed first correct/incorrect results count; skip without first answer breaks game streak but no StudyDay; cancel only current round. Games do not touch memory/SRS. AI also does not touch StudyDay/memory/SRS.
- AI start atomically consumes one successful session/day (UTC7), references latest remembered choices in published system deck; below5 needs consent. Max15 acknowledged pairs. Turn metadata/hash/lease only; REPLY_READY→DELIVERED ACK increments once. Reply lost from RAM is INTERRUPTED; never regenerate READY. Ending locks new sends; summary ≤3 tips, no quotes/transcripts.

## Shared backend integration surface

`functions/src/shared/core.ts` (root-owned) exports `db`, `bucket`, `Data`, `Actor { uid, contentAdmin, authTime }`, `fail(code,message)`, `assertActive(actor,tx?)`, `assertAdmin(actor)`, `command(actor,kind,input,callback)` where callback is `(tx, now:Timestamp)=>Promise<Data>`. `command` checks ACTIVE and receipt within its transaction BEFORE callback, writes receipt afterward. Callback must perform every read before writes. `id()`, `hash(value)`, `dayKey(date?)`, `addDays(day,n)`, `serialize(value)`, `requireDoc(snapshot,code?)`, `checkVersion(actual,expected)`, `parse(schema,input)` available.

`functions/src/services/dictionary.ts` (root-owned) exports `resolveRelease(releaseId?,tx?)`, `readWord(wordId,releaseId?,tx?)`, `readWordVersion(wordId,version,tx?)`, `readDeckSource(source,tx?)` returning `{source,words:[{wordId,wordVersion,word,entry?}]}`; `readPersonalSource(actor,tx?)` similar; `currentEntry(wordId,tx?)`. Published retained revisions valid for existing sessions. `WordSource={sourceType:'SYSTEM_DECK'|'PERSONAL_VOCABULARY',wordSetId?,revisionId?}`.

Each service exports a `Record<string, (actor:Actor,input:unknown)=>Promise<unknown>>` named `learningHandlers`, `gameHandlers`, `contentHandlers`, `reportHandlers` etc. Root combines these into Callable functions. Services import core helpers, not other handler registries. Additional worker exports may be wired by root after coordination. Internal rich entities may use Firestore DocumentData; public DTOs must be typed. Zod validation in each service.

## Admin API contract

`getAccess({})→{uid,roles:['LEARNER',...('CONTENT_ADMIN')]}`; `ensureProfile({displayName?})`; all below require contentAdmin true and ACTIVE.

- `listDecks({})→{items:WordSet[]}`; `createDeck({metadata:{name,topic,description?,coverImageAssetId?},commandId})→DraftEditorData`; `getDraft({wordSetId})`, `openDraft({wordSetId,expectedWordSetVersion,commandId})`→`{wordSet,revision,entries:SetWord[]}`.
- `saveDraft({wordSetId,revisionId,metadata,entries,expectedVersion,commandId})→DeckRevision`. SetWord `{wordId,wordVersion,position,focusMeaningId?,example?,exampleTranslation?,imageAssetId?,imageAlt?}`. Empty optional fields omitted, not empty string.
- `publishSet({wordSetId,revisionId,expectedWordSetVersion,expectedDraftVersion,commandId})→PublishReceipt` or in-progress command status. `setDeckActive({wordSetId,active,expectedVersion,commandId})`.
- Public `findWords({query,cursor?,releaseId?,pageSize?})→{items:[{wordId,wordVersion,spelling,phonetic?,meanings,matchType}],releaseId,cursor?}` and `getWord({wordId,releaseId?})`.
- `previewImport({wordSetId,revisionId,sourceFileId?,pastedRows?,assetIds:[],expectedDraftVersion,commandId})→{importId,releaseId,draftVersion,fingerprint,rows,counts}`. pastedRows objects `{word,partOfSpeech?,focusMeaningId?,example?,exampleTranslation?,position?,imageAssetId?,imageAlt?}`. `applyImport({importId,selectedRowIds,skippedRowIds,duplicateChoices,expectedDraftVersion,fingerprint,commandId})→{importId,appliedRowIds,skippedRowIds,errors,draftVersion}`. Duplicate choices map rowId→ADD|UPDATE|SKIP; ambiguous words require row resolution via `resolveImportRow({importId,rowId,wordId,focusMeaningId?,expectedDraftVersion,commandId})`. `getImport({importId})`, `listImports({wordSetId})`.
- `beginContentUpload({fileName,contentType,byteSize,kind:'IMAGE'|'IMPORT',commandId})→{assetId,storagePath}` then Firebase Storage SDK upload, `finalizeContentUpload({assetId})→ImageAsset`.
- `getSpeech({wordId})→{provider:'ANDROID_TTS',text,listenAllowed,version}`; `saveSpeech({wordId,listenAllowed,expectedVersion,commandId})→Speech`. Browser preview is Web Speech only and never proves device readiness.
- `listTopics({})→{items:ChatTopic[]}`; `getTopic({topicId})`; `saveTopic({topicId?,name,context,learnerRole,aiRole,goal,openingLine,guide,active,expectedVersion,commandId})→ChatTopic` (new version expected0).
- `getLimit({})→{maxSessionsPerDay,version}`; `saveLimit({maxSessionsPerDay,expectedVersion,commandId})`.
- `listReports({status?,category?,cursor?})→{items,cursor?}`; `getReport({reportId})`; `updateReportStatus({reportId,expectedVersion,newStatus,publicNote?,resolutionKind?,resolutionRef?,commandId})` (closeReport alias). FIXED validates published fix target; REJECTED requires publicNote.
- `getCommandStatus({commandId})→{status:'ABSENT'|'IN_PROGRESS'|'SUCCEEDED'|'FAILED',receipt?,error?,progress?}`.

Errors use Callable HttpsError.details `{code:<stable business code>}` such as CONFLICT, ACCOUNT_DELETING, DICTIONARY_NOT_READY, RELEASE_UNAVAILABLE, IMPORT_STALE, VALIDATION_FAILED, PERMISSION_DENIED. UI distinguishes loading/empty/error/saving/conflict/unknown; retains command ID and identical payload after uncertain writes and polls status before retry.

Image reads: `getImageAsset({assetId,wordSetId?,revisionId?,wordId?,wordVersion?,releaseId?})` preserves the admin metadata read. An ACTIVE learner supplies a verified public/retired deck cover or SetWord context, or an exact public release/WordVersion default Meaning context. It returns safe metadata/checksum and a short-lived read URL; assetId alone never grants learner access to a draft or upload. Raw Storage paths stay server-side for learners.

## Ownership during implementation

Root: shared core, dictionary, profile/avatar/deletion/chat, handler wiring, seed/dictionary tools, package/lock/config/docs/Git/integration. Backend agent: learning/game/content/report services and their own domain modules only. Admin agent: admin-web only. Review agent: tests/, root vitest configs, firestore.rules/storage.rules/firestore.indexes.json only; read-only review of implementation. No subagent Git or dependency install; request root changes to shared files/contracts.
