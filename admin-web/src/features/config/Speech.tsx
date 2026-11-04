import { useEffect, useState } from "react";
import { useMutation } from "../../app/contexts";
import { Icon, Notice, QueryState, TextField } from "../../components/ui";
import { useQuery } from "../../hooks/useQuery";
import { api, apiError } from "../../services/api";
import { cancelSpeech, previewSpeech } from "../../services/web-speech";
import type { Word } from "../../models";
export function SpeechPage({
  wordId,
  navigate,
  onDirty,
}: {
  wordId?: string;
  navigate: (path: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  return wordId ? (
    <SpeechEditor wordId={wordId} onDirty={onDirty} />
  ) : (
    <SpeechLookup navigate={navigate} />
  );
}
function SpeechLookup({ navigate }: { navigate: (path: string) => void }) {
  const [query, setQuery] = useState(""),
    [words, setWords] = useState<Word[]>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function search() {
    setLoading(true);
    setError("");
    try {
      setWords((await api("findWords", { query })).items);
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <h1>Cấu hình phát âm mục từ</h1>
      <form
        className="actions align-end"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <TextField label="Tìm mục từ" value={query} onChange={setQuery} />
        <button className="primary" disabled={loading || !query.trim()}>
          Tìm kiếm
        </button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {words?.length === 0 && (
        <div className="empty">Không tìm thấy mục từ.</div>
      )}
      <div className="choice-list">
        {words?.map((word) => (
          <button
            key={word.wordId}
            onClick={() =>
              navigate(`/speech/${encodeURIComponent(word.wordId)}`)
            }
          >
            {word.spelling} · {word.meanings.map((x) => x.text).join("; ")}
          </button>
        ))}
      </div>
    </>
  );
}
function SpeechEditor({
  wordId,
  onDirty,
}: {
  wordId: string;
  onDirty: (dirty: boolean) => void;
}) {
  const q = useQuery(
    () =>
      Promise.all([api("getSpeech", { wordId }), api("getWord", { wordId })]),
    [wordId],
  );
  const [allowed, setAllowed] = useState(false),
    [rate, setRate] = useState("1"),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false);
  const m = useMutation();
  useEffect(() => {
    if (q.data) setAllowed(q.data[0].listenAllowed);
  }, [q.data]);
  useEffect(() => {
    onDirty(!!q.data && allowed !== q.data[0].listenAllowed);
    return () => onDirty(false);
  }, [allowed, q.data, onDirty]);
  useEffect(() => () => cancelSpeech(), []);
  async function play(locale: "en-GB" | "en-US") {
    if (!q.data) return;
    setError("");
    setPlaying(true);
    try {
      await previewSpeech(q.data[1].spelling, locale, Number(rate));
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setPlaying(false);
    }
  }
  function save() {
    if (!q.data) return;
    const payload = {
      wordId,
      listenAllowed: allowed,
      expectedVersion: q.data[0].version,
    };
    void m.execute(
      (id) => api("saveSpeech", { ...payload, commandId: id }),
      () => q.reload(),
    );
  }
  return (
    <>
      <h1>Cấu hình phát âm mục từ</h1>
      <QueryState loading={q.loading} error={q.error} retry={q.reload}>
        {q.data && (
          <>
            <Notice>
              {q.data[1].spelling} · {wordId} · bản từ{" "}
              {q.data[1].wordVersion || q.data[1].version}
              <br />
              Cách viết và toàn bộ nghĩa từ điển chỉ đọc.
            </Notice>
            <div className="columns three">
              <div className="field">
                <label>Giọng Anh–Anh</label>
                <input value="en-GB" readOnly aria-label="Giọng Anh–Anh" />
              </div>
              <div className="field">
                <label>Giọng Anh–Mỹ</label>
                <input value="en-US" readOnly aria-label="Giọng Anh–Mỹ" />
              </div>
              <div className="field">
                <label htmlFor="tts-rate">Tốc độ nghe thử</label>
                <select
                  id="tts-rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                >
                  <option value="1">1,0×</option>
                  <option value="0.75">0,75×</option>
                </select>
              </div>
            </div>
            <label className="toggle-row">
              <span>
                Cho phép dùng trong bài nghe
                <small className="block">
                  Mục từ đủ điều kiện phát âm; đã rà soát nghĩa và từ loại.
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={allowed}
                onChange={(e) => setAllowed(e.target.checked)}
                disabled={m.phase === "saving" || m.phase === "unknown"}
              />
            </label>
            <div className="actions">
              <button onClick={() => void play("en-GB")} disabled={playing}>
                <Icon name="speaker" />
                Nghe thử Anh–Anh
              </button>
              <button onClick={() => void play("en-US")} disabled={playing}>
                <Icon name="speaker" />
                Nghe thử Anh–Mỹ
              </button>
              {playing && <button onClick={cancelSpeech}>Dừng</button>}
            </div>
            <p className="muted">
              Nghe thử trên trình duyệt dùng giọng có sẵn của máy này. Kết quả
              nghe thử không xác nhận giọng trên thiết bị Android.
            </p>
            <small>
              Đang sửa cấu hình phiên bản {q.data[0].version}. Thay đổi chỉ áp
              dụng cho lượt mới.
            </small>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="actions">
              <button
                className="primary"
                data-save
                onClick={save}
                disabled={
                  m.phase === "saving" ||
                  m.phase === "unknown" ||
                  allowed === q.data[0].listenAllowed
                }
              >
                <Icon name="save" />
                Lưu cấu hình phát âm
              </button>
              <button className="link" onClick={q.reload}>
                Tải lại / Hủy chỉnh sửa
              </button>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
