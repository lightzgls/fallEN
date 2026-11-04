import { useState } from "react";
import type { SetWord } from "../../models";
import { DraftPicker } from "../../components/DraftPicker";
import { Icon, Notice } from "../../components/Ui";
import { EntryEditor } from "./EntryEditor";
import { FlashcardPreview } from "./FlashcardPreview";
import { MetadataForm } from "./MetadataForm";
import { EntryTable } from "./EntryTable";
import { DeckDialogs } from "./DeckDialogs";
import { useDraftEditor } from "./useDraftEditor";
import { usePublishDeck } from "./usePublishDeck";
export function DraftEditor({
  navigate,
  onDirty,
}: {
  navigate: (path: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [entry, setEntry] = useState<SetWord>(),
    [preview, setPreview] = useState(false),
    [publish, setPublish] = useState(false),
    [deactivate, setDeactivate] = useState(false);
  const editor = useDraftEditor(onDirty);
  const {
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
  } = editor;
  const publication = usePublishDeck(
    draft,
    navigate,
    () => setPublish(false),
    () => setDeactivate(false),
  );
  if (!draft)
    return (
      <>
        <h1>Bản nháp bộ từ</h1>
        <DraftPicker />
        <Notice>Chọn bộ từ để mở bản nháp hoặc tạo bộ mới.</Notice>
        <button onClick={() => navigate("/decks")}>Về Bộ từ hệ thống</button>
      </>
    );
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
      <form
        data-dirty-form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <fieldset disabled={locked}>
          <MetadataForm
            metadata={metadata}
            setMetadata={setMetadata}
            cover={cover}
          />
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
          <EntryTable entries={entries} onEdit={setEntry} onMove={moveEntry} />
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
            <button type="button" className="link" onClick={reload}>
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
            replaceEntry(value);
            setEntry(undefined);
          }}
          onRemove={() => {
            removeEntry(entry.wordId);
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
      <DeckDialogs
        draft={draft}
        entryCount={entries.length}
        publish={publish}
        deactivate={deactivate}
        locked={locked}
        setPublish={setPublish}
        setDeactivate={setDeactivate}
        publishNow={publication.publishNow}
        setActive={publication.setActive}
      />
    </>
  );
}
