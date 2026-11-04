import { useDraft, useMutation } from "../../app/contexts";
import { api, apiError, completeResult } from "../../services/api";
import { mapImportRows } from "../../services/import-files";
import { downloadText } from "../../utils/content";
import type { useImportSource } from "./useImportSource";
import type { useImportSelection } from "./useImportSelection";

export function useImportCommands(
  input: ReturnType<typeof useImportSource>,
  selection: ReturnType<typeof useImportSelection>,
  onDirty: (dirty: boolean) => void,
  setError: (message: string) => void,
  setMessage: (message: string) => void,
  onApplied: () => void,
) {
  const draft = useDraft(),
    mutation = useMutation();
  function validate() {
    if (!draft.draft) return;
    setError("");
    try {
      const rows = mapImportRows(
        input.table,
        input.pasted,
        input.mapping,
        input.images,
      );
      if (!rows.length) {
        setError("Nhập ít nhất một từ.");
        return;
      }
      const payload = {
        wordSetId: draft.draft.wordSet.id,
        revisionId: draft.draft.revision.id,
        pastedRows: rows,
        assetIds: Object.values(input.images),
        expectedDraftVersion: draft.draft.revision.version,
      };
      void mutation.execute(
        (commandId) => api("previewImport", { ...payload, commandId }),
        selection.accept,
      );
    } catch (failure) {
      setError(apiError(failure).message);
    }
  }
  function apply() {
    const { preview, selected, duplicates } = selection;
    if (!preview) return;
    const payload = {
      importId: preview.importId,
      selectedRowIds: [...selected],
      skippedRowIds: preview.rows
        .filter((row) => !selected.has(row.id))
        .map((row) => row.id),
      duplicateChoices: duplicates,
      expectedDraftVersion: preview.draftVersion,
      fingerprint: preview.fingerprint,
    };
    void mutation.execute(
      async (commandId) =>
        completeResult(
          await api("applyImport", { ...payload, commandId }),
          commandId,
        ),
      (receipt) => {
        onApplied();
        setMessage(
          `Đã áp dụng ${receipt.appliedRowIds.length} dòng vào bản nháp, bỏ qua ${receipt.skippedRowIds.length} dòng.`,
        );
        onDirty(false);
        void draft.refresh();
        void api("getImport", { importId: preview.importId })
          .then(selection.setPreview)
          .catch((failure) => setError(apiError(failure).message));
      },
    );
  }
  function editSource() {
    selection.clearPreview();
    onDirty(!!input.pasted || !!input.table);
  }
  function downloadReport() {
    if (selection.preview)
      downloadText(
        `import-${selection.preview.importId}.json`,
        JSON.stringify(selection.preview, null, 2),
        "application/json",
      );
  }
  return {
    validate,
    apply,
    editSource,
    downloadReport,
    locked:
      input.uploading ||
      mutation.phase === "saving" ||
      mutation.phase === "unknown",
  };
}
