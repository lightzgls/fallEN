import { useState } from "react";
import { useDraft, useMutation } from "../app/contexts";
import { useQuery } from "../hooks/useQuery";
import { api } from "../services/api";
import { QueryState } from "./ui";
export function DraftPicker() {
  const query = useQuery(() => api("listDecks", {}));
  const { draft, setDraft } = useDraft(),
    mutation = useMutation();
  const [selected, setSelected] = useState("");
  function open() {
    const deck = query.data?.items.find((x) => x.id === selected);
    if (!deck) return;
    void mutation.execute(
      (id) =>
        api("openDraft", {
          wordSetId: deck.id,
          expectedWordSetVersion: deck.version,
          commandId: id,
        }),
      setDraft,
    );
  }
  return (
    <QueryState
      loading={query.loading}
      error={query.error}
      retry={query.reload}
    >
      <div className="draft-picker">
        <label htmlFor="target-deck">Bản nháp đích</label>
        <select
          id="target-deck"
          value={selected || draft?.wordSet.id || ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Chọn bộ từ…</option>
          {query.data?.items.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name || deck.draft?.name || deck.id}{" "}
              {deck.draftRevisionId ? "· có bản nháp" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={open}
          disabled={!selected || mutation.phase === "saving"}
        >
          Mở bản nháp
        </button>
        {draft && (
          <small>
            {draft.revision.name} · phiên bản {draft.revision.version}
          </small>
        )}
      </div>
    </QueryState>
  );
}
