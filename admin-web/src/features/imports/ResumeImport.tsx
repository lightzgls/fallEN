import { useState } from "react";
import type { ImportPreview } from "../../models";
import { api, apiError } from "../../services/api";
import { useQuery } from "../../hooks/useQuery";
import { Dialog, QueryState, Notice } from "../../components/ui";
export function ResumeImport({
  wordSetId,
  onClose,
  onSelect,
}: {
  wordSetId: string;
  onClose: () => void;
  onSelect: (value: ImportPreview) => void;
}) {
  const query = useQuery(() => api("listImports", { wordSetId }));
  const [error, setError] = useState("");
  async function load(id: string) {
    try {
      onSelect(await api("getImport", { importId: id }));
    } catch (e) {
      setError(apiError(e).message);
    }
  }
  return (
    <Dialog title="Tiếp tục lô nhập" onClose={onClose}>
      <QueryState
        loading={query.loading}
        error={query.error}
        retry={query.reload}
        empty={query.data?.items.length === 0}
      >
        {query.data?.items.map((item) => (
          <button
            className="resume-row"
            key={item.importId}
            onClick={() => void load(item.importId)}
          >
            {item.importId} · {item.status || "Xem trước"} · nháp{" "}
            {item.draftVersion}
          </button>
        ))}
      </QueryState>
      {error && <Notice tone="error">{error}</Notice>}
    </Dialog>
  );
}
