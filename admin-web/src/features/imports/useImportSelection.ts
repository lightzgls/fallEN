import { useState } from "react";
import type { ImportPreview } from "../../models";
export function useImportSelection(onDirty: (dirty: boolean) => void) {
  const [preview, setPreview] = useState<ImportPreview>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [duplicates, setDuplicates] = useState<
    Record<string, "ADD" | "UPDATE" | "SKIP">
  >({});
  function accept(value: ImportPreview) {
    setPreview(value);
    setSelected(
      new Set(
        value.rows
          .filter((row) => ["READY", "MATCHED"].includes(row.status))
          .map((row) => row.id),
      ),
    );
    setDuplicates({});
    onDirty(true);
  }
  function selectRow(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function chooseDuplicate(id: string, choice: "UPDATE" | "SKIP") {
    setDuplicates({ ...duplicates, [id]: choice });
    selectRow(id, choice === "UPDATE");
  }
  return {
    preview,
    setPreview,
    selected,
    duplicates,
    accept,
    selectRow,
    chooseDuplicate,
    clearPreview: () => setPreview(undefined),
  };
}
