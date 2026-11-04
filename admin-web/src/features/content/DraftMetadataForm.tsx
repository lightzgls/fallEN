import type { Metadata } from "../../models";
import { StoredImage } from "../../components/StoredImage";
import { TextField } from "../../components/ui";
export function DraftMetadataForm({
  metadata,
  setMetadata,
  cover,
}: {
  metadata: Metadata;
  setMetadata: (value: Metadata) => void;
  cover: (file?: File) => Promise<void>;
}) {
  return (
    <>
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
    </>
  );
}
