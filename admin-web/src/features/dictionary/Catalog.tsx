import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDraft, useMutation } from "../../app/contexts";
import { DraftPicker } from "../../components/DraftPicker";
import { Icon, Notice, TextField } from "../../components/ui";
import { api, apiError, type ApiError } from "../../services/api";
import { cleanEntry, metadataOf } from "../../utils/content";
import type { Word, WordPage } from "../../models";
export function Catalog({ navigate }: { navigate: (path: string) => void }) {
  const draft = useDraft(),
    m = useMutation();
  const [query, setQuery] = useState(""),
    [partOfSpeech, setPartOfSpeech] = useState(""),
    [result, setResult] = useState<WordPage>(),
    [selected, setSelected] = useState<Record<string, Word>>({}),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<ApiError>();
  const request = useRef(0),
    lastQuery = useRef("");
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function search(more = false) {
    const token = ++request.current;
    setLoading(true);
    setError(undefined);
    const key = JSON.stringify([query.trim(), partOfSpeech]);
    try {
      const response = await api("findWords", {
        query: query.trim(),
        ...(partOfSpeech ? { partOfSpeech } : {}),
        ...(more && result && key === lastQuery.current
          ? { cursor: result.cursor, releaseId: result.releaseId }
          : {}),
        pageSize: 30,
      });
      if (token !== request.current) return;
      lastQuery.current = key;
      setResult(
        more && result
          ? { ...response, items: [...result.items, ...response.items] }
          : response,
      );
      if (!more) setSelected({});
    } catch (e) {
      if (token === request.current) setError(apiError(e));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }
  function add() {
    if (!draft.draft) return;
    const current = draft.draft;
    const extra = Object.values(selected).filter(
      (word) => !current.entries.some((x) => x.wordId === word.wordId),
    );
    const entries = [
      ...current.entries.map(cleanEntry),
      ...extra.map((word, i) => ({
        wordId: word.wordId,
        wordVersion: word.wordVersion,
        position: current.entries.length + i + 1,
      })),
    ];
    const payload = {
      wordSetId: current.wordSet.id,
      revisionId: current.revision.id,
      metadata: metadataOf(current.revision),
      entries,
      expectedVersion: current.revision.version,
    };
    void m.execute(
      (id) => api("saveDraft", { ...payload, commandId: id }),
      () => {
        setSelected({});
        void draft.refresh();
        navigate("/draft");
      },
    );
  }
  const selectedCount = Object.keys(selected).length;
  return (
    <>
      <h1>Chọn từ từ điển</h1>
      <p className="muted">
        {draft.draft
          ? `Thêm từ có sẵn vào bản nháp “${draft.draft.revision.name}”.`
          : "Chọn bản nháp để thêm từ từ danh mục."}
      </p>
      <DraftPicker />
      <form
        className="columns search-form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void search();
        }}
      >
        <TextField
          label="Tìm từ hoặc cụm từ"
          value={query}
          onChange={(value) => {
            setQuery(value);
            request.current++;
            setResult(undefined);
          }}
        />
        <div className="field">
          <label htmlFor="pos-filter">Từ loại</label>
          <select
            id="pos-filter"
            value={partOfSpeech}
            onChange={(e) => {
              setPartOfSpeech(e.target.value);
              setResult(undefined);
            }}
          >
            <option value="">Tất cả</option>
            {[
              "noun",
              "verb",
              "adjective",
              "adverb",
              "phrase",
              "preposition",
              "pronoun",
              "conjunction",
              "interjection",
            ].map((pos) => (
              <option key={pos}>{pos}</option>
            ))}
          </select>
        </div>
        <button className="primary" disabled={loading || !query.trim()}>
          Tìm kiếm
        </button>
      </form>
      <Notice>
        Danh mục chỉ đọc. Chọn từ để dùng lại cách viết và các nghĩa đã có.
      </Notice>
      {error && (
        <Notice tone="error">
          {error.message}
          <button className="link" onClick={() => void search()}>
            Thử lại
          </button>
        </Notice>
      )}
      {loading && !result && <p role="status">Đang tìm từ…</p>}
      {result && (
        <>
          <small>Danh mục: {result.releaseId}</small>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Chọn</th>
                  <th>Mục từ / phiên âm</th>
                  <th>Từ loại và nghĩa</th>
                  <th>Trong bản nháp</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.items.map((word) => {
                  const exists = draft.draft?.entries.some(
                    (x) => x.wordId === word.wordId,
                  );
                  return (
                    <tr key={word.wordId}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${word.spelling}`}
                          checked={!!selected[word.wordId]}
                          disabled={exists || !draft.draft}
                          onChange={(e) =>
                            setSelected((current) => {
                              const next = { ...current };
                              if (e.target.checked) next[word.wordId] = word;
                              else delete next[word.wordId];
                              return next;
                            })
                          }
                        />
                      </td>
                      <td>
                        {word.spelling} <small>{word.phonetic}</small>
                        <small className="block mono">
                          {word.wordId} · bản {word.wordVersion}
                        </small>
                      </td>
                      <td>
                        {word.meanings
                          ?.map((x) => `${x.partOfSpeech} · ${x.text}`)
                          .join("; ")}
                      </td>
                      <td>{exists ? "Đã có" : "Chưa có"}</td>
                      <td>
                        <button
                          className="link"
                          onClick={() =>
                            navigate(
                              `/speech/${encodeURIComponent(word.wordId)}`,
                            )
                          }
                        >
                          TTS
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.items.length === 0 && (
            <div className="empty">
              Không tìm thấy từ cần chọn. Kiểm tra cách viết hoặc giữ lại để đề
              nghị bổ sung danh mục.
            </div>
          )}
          <div className="actions">
            <button
              className="primary"
              disabled={
                !selectedCount ||
                !draft.draft ||
                m.phase === "saving" ||
                m.phase === "unknown"
              }
              onClick={add}
            >
              Thêm {selectedCount} từ đã chọn
            </button>
            <button
              disabled={!result.cursor || loading}
              onClick={() => void search(true)}
            >
              {loading ? "Đang tải…" : "Tải thêm kết quả"}
            </button>
            <button onClick={() => navigate("/draft")}>
              <Icon name="back" />
              Về bản nháp
            </button>
          </div>
        </>
      )}
    </>
  );
}
