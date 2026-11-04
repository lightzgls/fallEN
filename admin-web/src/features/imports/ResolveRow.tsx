import { useState } from "react";
import { useMutation } from "../../app/contexts";
import type { ImportRow, ImportPreview } from "../../models";
import { api, apiError } from "../../services/api";
import { Dialog, Notice } from "../../components/ui";
export function ResolveRow({
  row,
  preview,
  onClose,
  onResolved,
}: {
  row: ImportRow;
  preview: ImportPreview;
  onClose: () => void;
  onResolved: (value: ImportPreview) => void;
}) {
  const [meaning, setMeaning] = useState(row.focusMeaningId || "");
  const [error, setError] = useState("");
  const mutation = useMutation();
  function save() {
    if (!row.resolvedWordId || !meaning) return;
    const payload = {
      importId: preview.importId,
      rowId: row.id,
      wordId: row.resolvedWordId,
      focusMeaningId: meaning,
      expectedDraftVersion: preview.draftVersion,
    };
    void mutation.execute(
      (id) => api("resolveImportRow", { ...payload, commandId: id }),
      () => {
        void api("getImport", { importId: preview.importId })
          .then(onResolved)
          .catch((e) => setError(apiError(e).message));
      },
    );
  }
  return (
    <Dialog
      title={`Chọn nghĩa trọng tâm · dòng ${row.rowNumber} · ${row.rawWord}`}
      onClose={onClose}
    >
      <Notice>
        Chọn nghĩa của mục từ đã khớp chính xác trong danh mục đã pin. Không tự
        nhận gợi ý gần đúng.
      </Notice>
      <div className="field">
        <label htmlFor="resolve-meaning">Nghĩa trọng tâm</label>
        <select
          id="resolve-meaning"
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
        >
          <option value="">Chọn nghĩa</option>
          {row.meaningCandidates?.map((x) => (
            <option value={x.id} key={x.id}>
              {x.partOfSpeech} · {x.text}
            </option>
          ))}
        </select>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="actions">
        <button
          className="primary"
          onClick={save}
          disabled={!meaning || mutation.phase === "saving"}
        >
          Xác nhận nghĩa
        </button>
        <button onClick={onClose}>Quay lại</button>
      </div>
    </Dialog>
  );
}
