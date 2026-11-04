import { useEffect, useState, type FormEvent } from "react";
import { useDraft, useMutation } from "../../app/contexts";
import { DraftPicker } from "../../components/DraftPicker";
import { StoredImage } from "../../components/StoredImage";
import {
  Dialog,
  Icon,
  Notice,
  QueryState,
  TextField,
} from "../../components/ui";
import { useQuery } from "../../hooks/useQuery";
import { api, apiError, completeResult, uploadAsset } from "../../services/api";
import { cleanEntry, entryError, metadataOf } from "../../utils/content";
import type { DraftEditorData, Metadata, SetWord } from "../../models";

export function DraftEditor({
  navigate,
  onDirty,
}: {
  navigate: (path: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const context = useDraft(),
    m = useMutation();
  const [metadata, setMetadata] = useState<Metadata>({ name: "", topic: "" }),
    [entries, setEntries] = useState<SetWord[]>([]),
    [entry, setEntry] = useState<SetWord>(),
    [preview, setPreview] = useState(false),
    [publish, setPublish] = useState(false),
    [deactivate, setDeactivate] = useState(false),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
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
  if (!draft)
    return (
      <>
        <h1>Bản nháp bộ từ</h1>
        <DraftPicker />
        <Notice>Chọn bộ từ để mở bản nháp hoặc tạo bộ mới.</Notice>
        <button onClick={() => navigate("/decks")}>Về Bộ từ hệ thống</button>
      </>
    );
  const locked =
    m.phase === "saving" ||
    m.phase === "unknown" ||
    draft.revision.state !== "DRAFT" ||
    uploading;
  function save(event?: FormEvent) {
    event?.preventDefault();
    if (!draft) return;
    setError("");
    const invalid = entries.map(entryError).find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
    const captured = {
      wordSetId: draft.wordSet.id,
      revisionId: draft.revision.id,
      metadata: metadataOf(metadata),
      entries: entries.map(cleanEntry),
      expectedVersion: draft.revision.version,
    };
    void m.execute(
      (id) => api("saveDraft", { ...captured, commandId: id }),
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
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setUploading(false);
    }
  }
  function publishNow() {
    if (!draft) return;
    const payload = {
      wordSetId: draft.wordSet.id,
      revisionId: draft.revision.id,
      expectedWordSetVersion: draft.wordSet.version,
      expectedDraftVersion: draft.revision.version,
    };
    void m.execute(
      async (id) =>
        completeResult(
          await api("publishSet", { ...payload, commandId: id }),
          id,
        ),
      () => {
        setPublish(false);
        context.setDraft(undefined);
        navigate("/decks");
      },
    );
  }
  function setActive() {
    if (!draft) return;
    const payload = {
      wordSetId: draft.wordSet.id,
      active: !draft.wordSet.active,
      expectedVersion: draft.wordSet.version,
    };
    void m.execute(
      (id) => api("setDeckActive", { ...payload, commandId: id }),
      () => {
        setDeactivate(false);
        void context.refresh();
      },
    );
  }
  return (
    <>
      <div className="heading-row">
        <h1>Bản nháp · {draft.revision.name}</h1>
        <small>
          Phiên bản {draft.revision.version} · {draft.revision.state}
        </small>
      </div>
      <Notice>
        Đang sửa bản nháp. Người học tiếp tục dùng phiên bản đã công khai.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <form data-dirty-form onSubmit={save}>
        <fieldset disabled={locked}>
          <div className="columns two">
            <TextField
              label="Tên bộ"
              required
              maxLength={100}
              value={metadata.name}
              onChange={(name) => setMetadata({ ...metadata, name })}
            />
            <TextField
              label="Chủ đề"
              required
              maxLength={100}
              value={metadata.topic}
              onChange={(topic) => setMetadata({ ...metadata, topic })}
            />
          </div>
          <div className="cover-editor">
            <StoredImage
              assetId={metadata.coverImageAssetId}
              alt={`Ảnh bìa ${metadata.name}`}
              className="cover"
            />
            <div>
              <label className="button file-button">
                Đổi ảnh bìa
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void cover(e.target.files?.[0])}
                  hidden
                />
              </label>
              <TextField
                label="Mô tả"
                value={metadata.description || ""}
                onChange={(description) =>
                  setMetadata({ ...metadata, description })
                }
              />
              {metadata.coverImageAssetId && (
                <button
                  className="link"
                  type="button"
                  onClick={() =>
                    setMetadata({ ...metadata, coverImageAssetId: undefined })
                  }
                >
                  Gỡ ảnh bìa
                </button>
              )}
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              disabled={dirty}
              onClick={() => navigate("/catalog")}
            >
              Tìm và chọn nhiều từ
            </button>
            <button
              type="button"
              disabled={dirty}
              onClick={() => navigate("/imports")}
            >
              <Icon name="upload" />
              Nhập hàng loạt
            </button>
            <button
              type="button"
              disabled={!entries.length}
              onClick={() => setPreview(true)}
            >
              <Icon name="eye" />
              Xem thử thẻ
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Vị trí</th>
                  <th>Mục từ</th>
                  <th>Nghĩa trọng tâm</th>
                  <th>Học liệu trong bộ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((item, index) => (
                  <EntryRow
                    key={item.wordId}
                    entry={item}
                    onEdit={() => setEntry(item)}
                    onMove={(direction) => {
                      const other = index + direction;
                      if (other < 0 || other >= entries.length) return;
                      const next = [...entries];
                      [next[index], next[other]] = [next[other], next[index]];
                      setEntries(
                        next.map((x, i) => ({ ...x, position: i + 1 })),
                      );
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {!entries.length && (
            <div className="empty">
              Bản nháp chưa có từ. Chọn từ từ danh mục hoặc nhập hàng loạt.
            </div>
          )}
          <div className="actions">
            <button className="primary" disabled={!dirty}>
              <Icon name="save" />
              {uploading ? "Đang tải ảnh…" : "Lưu nháp"}
            </button>
            <button
              type="button"
              disabled={dirty || !entries.length}
              onClick={() => setPublish(true)}
            >
              Công khai
            </button>
            <button
              type="button"
              className="link danger"
              onClick={() => setDeactivate(true)}
            >
              {draft.wordSet.active ? "Ngừng sử dụng" : "Sử dụng lại"}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm("Bỏ thay đổi chưa lưu và tải bản mới?")
                )
                  void context.refresh();
              }}
            >
              Tải bản mới
            </button>
          </div>
          {dirty && (
            <small>
              Lưu bản nháp trước khi thêm từ, nhập lô hoặc công khai.
            </small>
          )}
        </fieldset>
      </form>
      {entry && (
        <EntryEditor
          entry={entry}
          onClose={() => setEntry(undefined)}
          onSave={(value) => {
            setEntries(
              entries.map((x) => (x.wordId === value.wordId ? value : x)),
            );
            setEntry(undefined);
          }}
          onRemove={() => {
            setEntries(
              entries
                .filter((x) => x.wordId !== entry.wordId)
                .map((x, i) => ({ ...x, position: i + 1 })),
            );
            setEntry(undefined);
          }}
        />
      )}
      {preview && (
        <FlashcardPreview
          draft={{
            ...draft,
            revision: { ...draft.revision, ...metadata },
            entries,
          }}
          onClose={() => setPreview(false)}
        />
      )}
      {publish && (
        <Dialog title="Công khai bản nháp" onClose={() => setPublish(false)}>
          <p>
            {draft.revision.name} · {entries.length} từ · phiên bản{" "}
            {draft.revision.version}
          </p>
          <Notice>
            Máy chủ sẽ kiểm tra học liệu và ảnh trước khi đổi bản công khai.
            Phiên học đang diễn ra giữ phiên bản cũ.
          </Notice>
          <div className="actions">
            <button className="primary" onClick={publishNow} disabled={locked}>
              Xác nhận công khai
            </button>
            <button onClick={() => setPublish(false)} disabled={locked}>
              Quay lại
            </button>
          </div>
        </Dialog>
      )}
      {deactivate && (
        <Dialog
          title={draft.wordSet.active ? "Ngừng sử dụng bộ" : "Sử dụng lại bộ"}
          onClose={() => setDeactivate(false)}
        >
          <p>
            Bộ ngừng sử dụng không xuất hiện cho phiên mới. Lịch sử đã có được
            giữ.
          </p>
          <div className="actions">
            <button className="primary" onClick={setActive} disabled={locked}>
              Xác nhận
            </button>
            <button onClick={() => setDeactivate(false)}>Hủy</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function EntryRow({
  entry,
  onEdit,
  onMove,
}: {
  entry: SetWord;
  onEdit: () => void;
  onMove: (direction: number) => void;
}) {
  const word = useQuery(
    () =>
      api("getWordVersion", {
        wordId: entry.wordId,
        wordVersion: entry.wordVersion,
      }),
    [entry.wordId, entry.wordVersion],
  );
  const meaning = word.data?.meanings.find(
    (x) => x.id === entry.focusMeaningId,
  );
  return (
    <tr>
      <td>{entry.position}</td>
      <td>
        {word.data?.spelling || entry.wordId}
        <small className="block">Bản từ {entry.wordVersion}</small>
      </td>
      <td>
        {meaning
          ? `${meaning.text} · ${meaning.partOfSpeech}`
          : word.error
            ? "Không tải được nghĩa"
            : "Mặc định từ điển"}
      </td>
      <td>
        {entry.example ? "Có ví dụ" : "Chưa có ví dụ"}
        {entry.imageAssetId ? " và ảnh" : ""} ·{" "}
        <button type="button" className="link" onClick={onEdit}>
          Sửa
        </button>
      </td>
      <td>
        <button
          type="button"
          className="icon-button"
          aria-label={`Chuyển ${word.data?.spelling || entry.wordId} lên`}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Chuyển ${word.data?.spelling || entry.wordId} xuống`}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
      </td>
    </tr>
  );
}
function EntryEditor({
  entry,
  onSave,
  onRemove,
  onClose,
}: {
  entry: SetWord;
  onSave: (entry: SetWord) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(entry),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  const word = useQuery(() =>
    api("getWordVersion", {
      wordId: entry.wordId,
      wordVersion: entry.wordVersion,
    }),
  );
  async function image(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadAsset(file, "IMAGE");
      setValue({ ...value, imageAssetId: asset.id || asset.assetId });
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <Dialog
      title={`Học liệu trong bộ · ${word.data?.spelling || entry.wordId}`}
      onClose={onClose}
    >
      <QueryState loading={word.loading} error={word.error} retry={word.reload}>
        <Notice>
          Chỉ thay đổi học liệu của từ trong bộ. Cách viết và nghĩa từ điển chỉ
          đọc.
        </Notice>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const invalid = entryError(value);
            if (invalid) {
              setError(invalid);
              return;
            }
            onSave(cleanEntry(value));
          }}
        >
          <div className="columns two">
            <TextField
              label="Vị trí trong bộ"
              type="number"
              min={1}
              value={String(value.position)}
              onChange={(position) =>
                setValue({ ...value, position: Number(position) })
              }
            />
            <div className="field">
              <label htmlFor="focus-meaning">Nghĩa trọng tâm</label>
              <select
                id="focus-meaning"
                value={value.focusMeaningId || ""}
                onChange={(e) =>
                  setValue({
                    ...value,
                    focusMeaningId: e.target.value || undefined,
                  })
                }
              >
                <option value="">Dùng học liệu mặc định</option>
                {word.data?.meanings.map((meaning) => (
                  <option key={meaning.id} value={meaning.id}>
                    {meaning.partOfSpeech} · {meaning.text}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label="Ví dụ tiếng Anh"
              multiline
              value={value.example || ""}
              onChange={(example) => setValue({ ...value, example })}
            />
            <TextField
              label="Bản dịch ví dụ"
              multiline
              value={value.exampleTranslation || ""}
              onChange={(exampleTranslation) =>
                setValue({ ...value, exampleTranslation })
              }
            />
          </div>
          <div className="cover-editor">
            <StoredImage
              assetId={value.imageAssetId}
              alt={value.imageAlt || "Ảnh học liệu"}
              className="cover"
            />
            <div>
              <label className="button file-button">
                Đổi ảnh minh họa
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void image(e.target.files?.[0])}
                />
              </label>
              <TextField
                label="Mô tả ảnh"
                value={value.imageAlt || ""}
                onChange={(imageAlt) => setValue({ ...value, imageAlt })}
              />
              <button
                type="button"
                className="link"
                onClick={() =>
                  setValue({
                    ...value,
                    imageAssetId: undefined,
                    imageAlt: undefined,
                  })
                }
              >
                Dùng ảnh mặc định
              </button>
            </div>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <small>Ví dụ và bản dịch cùng có hoặc cùng để trống.</small>
          <div className="actions">
            <button className="primary" disabled={uploading}>
              Áp dụng chỉnh sửa
            </button>
            <button type="button" onClick={onRemove}>
              Gỡ từ khỏi bộ
            </button>
            <button type="button" onClick={onClose}>
              Hủy chỉnh sửa
            </button>
          </div>
        </form>
      </QueryState>
    </Dialog>
  );
}
function FlashcardPreview({
  draft,
  onClose,
}: {
  draft: DraftEditorData;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0),
    [back, setBack] = useState(false);
  const entry = draft.entries[index];
  const word = useQuery(
    () =>
      api("getWordVersion", {
        wordId: entry.wordId,
        wordVersion: entry.wordVersion,
      }),
    [entry.wordId, entry.wordVersion],
  );
  const meaning =
    word.data?.meanings.find((x) => x.id === entry.focusMeaningId) ||
    word.data?.meanings[0];
  const example = entry.example || meaning?.example,
    translation = entry.example
      ? entry.exampleTranslation
      : meaning?.exampleTranslation;
  return (
    <Dialog title={`Xem thử · Nháp · ${draft.revision.name}`} onClose={onClose}>
      <QueryState loading={word.loading} error={word.error} retry={word.reload}>
        <div className="flashcard">
          <small>
            {index + 1}/{draft.entries.length} ·{" "}
            {back ? "Mặt sau" : "Mặt trước"}
          </small>
          <h2>{word.data?.spelling}</h2>
          <p>{word.data?.phonetic}</p>
          {!back ? (
            <>
              <StoredImage
                assetId={entry.imageAssetId || meaning?.imageAssetId}
                alt={entry.imageAlt || meaning?.imageAlt || "Ảnh từ vựng"}
                className="flashcard-image"
              />
              {example && <p>{example}</p>}
            </>
          ) : (
            <>
              <h3>{meaning?.text}</h3>
              <small>{meaning?.partOfSpeech}</small>
              {example && (
                <p>
                  {example}
                  <br />
                  {translation}
                </p>
              )}
            </>
          )}
          <button onClick={() => setBack(!back)}>Lật thẻ</button>
        </div>
        <div className="actions">
          <button
            disabled={index === 0}
            onClick={() => {
              setIndex(index - 1);
              setBack(false);
            }}
          >
            Từ trước
          </button>
          <button
            disabled={index === draft.entries.length - 1}
            onClick={() => {
              setIndex(index + 1);
              setBack(false);
            }}
          >
            Từ tiếp
          </button>
        </div>
      </QueryState>
    </Dialog>
  );
}
