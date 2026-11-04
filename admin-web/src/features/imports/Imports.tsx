import { useState } from "react";
import { useDraft } from "../../app/contexts";
import { DraftPicker } from "../../components/DraftPicker";
import { Notice } from "../../components/ui";
import type { ImportRow } from "../../models";
import { ImportSourceForm } from "./ImportSourceForm";
import { ImportPreviewTable } from "./ImportPreviewTable";
import { ImportConfirmation } from "./ImportConfirmation";
import { ResumeImport } from "./ResumeImport";
import { ResolveRow } from "./ResolveRow";
import { useImportSource } from "./useImportSource";
import { useImportSelection } from "./useImportSelection";
import { useImportCommands } from "./useImportCommands";

export function Imports({
  navigate,
  onDirty,
}: {
  navigate: (path: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const draft = useDraft();
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [resolve, setResolve] = useState<ImportRow>(),
    [confirm, setConfirm] = useState(false),
    [resume, setResume] = useState(false);
  const selection = useImportSelection(onDirty);
  const input = useImportSource(
    onDirty,
    selection.clearPreview,
    setError,
    setMessage,
  );
  const commands = useImportCommands(
    input,
    selection,
    onDirty,
    setError,
    setMessage,
    () => setConfirm(false),
  );
  const { preview } = selection;
  return (
    <>
      <h1>
        {preview
          ? "Xem trước và xử lý từng dòng"
          : "Nhập danh sách vào bản nháp"}
      </h1>
      <p className="muted">
        Dán mỗi dòng một từ/cụm từ hoặc chọn tệp CSV/XLSX.
      </p>
      <DraftPicker />
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {!preview ? (
        <ImportSourceForm
          input={input}
          locked={commands.locked}
          hasDraft={!!draft.draft}
          onPreview={commands.validate}
          onResume={() => setResume(true)}
          onDraft={() => navigate("/draft")}
        />
      ) : (
        <ImportPreviewTable
          preview={preview}
          selected={selection.selected}
          duplicates={selection.duplicates}
          locked={commands.locked}
          onSelect={selection.selectRow}
          onDuplicate={selection.chooseDuplicate}
          onResolve={setResolve}
          onApply={() => setConfirm(true)}
          onDownload={commands.downloadReport}
          onEditSource={commands.editSource}
          onDraft={() => navigate("/draft")}
        />
      )}
      {confirm && preview && (
        <ImportConfirmation
          selectedCount={selection.selected.size}
          rowCount={preview.rows.length}
          locked={commands.locked}
          apply={commands.apply}
          onClose={() => setConfirm(false)}
        />
      )}
      {resolve && preview && (
        <ResolveRow
          row={resolve}
          preview={preview}
          onClose={() => setResolve(undefined)}
          onResolved={(value) => {
            selection.accept(value);
            setResolve(undefined);
          }}
        />
      )}
      {resume && draft.draft && (
        <ResumeImport
          wordSetId={draft.draft.wordSet.id}
          onClose={() => setResume(false)}
          onSelect={(value) => {
            selection.accept(value);
            setResume(false);
          }}
        />
      )}
    </>
  );
}
