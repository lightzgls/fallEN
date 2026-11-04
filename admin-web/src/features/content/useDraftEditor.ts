import { useEffect, useState } from "react";
import { useDraft, useMutation } from "../../app/contexts";
import type { Metadata, SetWord } from "../../models";
import { api, apiError, uploadAsset } from "../../services/api";
import { cleanEntry, entryError, metadataOf } from "../../utils/content";

export function useDraftEditor(onDirty: (dirty: boolean) => void) {
  const context = useDraft(),
    mutation = useMutation();
  const [metadata, setMetadata] = useState<Metadata>({ name: "", topic: "" });
  const [entries, setEntries] = useState<SetWord[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const draft = context.draft;
  useEffect(() => {
    if (draft) {
      setMetadata(metadataOf(draft.revision));
      setEntries(draft.entries);
    }
  }, [draft]);
  const dirty =
    !!draft &&
    (JSON.stringify(metadata) !== JSON.stringify(metadataOf(draft.revision)) ||
      JSON.stringify(entries) !== JSON.stringify(draft.entries));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const locked =
    mutation.phase === "saving" ||
    mutation.phase === "unknown" ||
    draft?.revision.state !== "DRAFT" ||
    uploading;

  function save() {
    if (!draft) return;
    setError("");
    const invalid = entries.map(entryError).find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
    const payload = {
      wordSetId: draft.wordSet.id,
      revisionId: draft.revision.id,
      metadata: metadataOf(metadata),
      entries: entries.map(cleanEntry),
      expectedVersion: draft.revision.version,
    };
    void mutation.execute(
      (commandId) => api("saveDraft", { ...payload, commandId }),
      () => {
        void context.refresh();
      },
    );
  }
  async function cover(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const asset = await uploadAsset(file, "IMAGE");
      setMetadata((value) => ({
        ...value,
        coverImageAssetId: asset.id || asset.assetId,
      }));
    } catch (failure) {
      setError(apiError(failure).message);
    } finally {
      setUploading(false);
    }
  }
  function moveEntry(index: number, direction: number) {
    const other = index + direction;
    if (other < 0 || other >= entries.length) return;
    const next = [...entries];
    [next[index], next[other]] = [next[other], next[index]];
    setEntries(
      next.map((entry, position) => ({ ...entry, position: position + 1 })),
    );
  }
  function replaceEntry(value: SetWord) {
    setEntries(
      entries.map((entry) => (entry.wordId === value.wordId ? value : entry)),
    );
  }
  function removeEntry(wordId: string) {
    setEntries(
      entries
        .filter((entry) => entry.wordId !== wordId)
        .map((entry, index) => ({ ...entry, position: index + 1 })),
    );
  }
  function reload() {
    if (!dirty || window.confirm("Bỏ thay đổi chưa lưu và tải bản mới?"))
      void context.refresh();
  }
  return {
    draft,
    metadata,
    setMetadata,
    entries,
    dirty,
    locked,
    error,
    uploading,
    save,
    cover,
    moveEntry,
    replaceEntry,
    removeEntry,
    reload,
  };
}
