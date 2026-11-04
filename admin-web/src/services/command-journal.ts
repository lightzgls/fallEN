const mutationNames = new Set([
  "createDeck",
  "openDraft",
  "saveDraft",
  "publishSet",
  "setDeckActive",
  "previewImport",
  "applyImport",
  "resolveImportRow",
  "beginContentUpload",
  "saveSpeech",
  "saveTopic",
  "saveLimit",
  "updateReportStatus",
]);
export interface PendingCommand {
  uid: string;
  commandId: string;
  name: string;
  input: Record<string, unknown>;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function key(uid: string) {
  return `fallen-admin-command:${uid}`;
}
export function recordCommand(command: PendingCommand): void {
  if (!mutationNames.has(command.name)) return;
  sessionStorage.setItem(key(command.uid), JSON.stringify(command));
}
export function readPendingCommand(uid: string): PendingCommand | undefined {
  try {
    const raw = sessionStorage.getItem(key(uid));
    if (!raw) return;
    const value: unknown = JSON.parse(raw);
    if (
      isRecord(value) &&
      value.uid === uid &&
      typeof value.commandId === "string" &&
      typeof value.name === "string" &&
      mutationNames.has(value.name) &&
      isRecord(value.input) &&
      value.input.commandId === value.commandId
    )
      return {
        uid,
        commandId: value.commandId,
        name: value.name,
        input: value.input,
      };
  } catch {
    return;
  }
  sessionStorage.removeItem(key(uid));
}
export function clearUserCommandJournal(uid: string): void {
  sessionStorage.removeItem(key(uid));
}
export function clearPendingCommand(uid: string, commandId: string): void {
  if (readPendingCommand(uid)?.commandId === commandId)
    sessionStorage.removeItem(key(uid));
}
