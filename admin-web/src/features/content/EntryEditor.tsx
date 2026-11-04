import { useState } from "react";
import type { SetWord } from "../../models";
import { useQuery } from "../../hooks/useQuery";
import { api, apiError, uploadAsset } from "../../services/api";
import { cleanEntry, entryError } from "../../utils/content";
import { StoredImage } from "../../components/StoredImage";
import { Dialog, Notice, QueryState, TextField } from "../../components/Ui";
export function EntryEditor({
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
