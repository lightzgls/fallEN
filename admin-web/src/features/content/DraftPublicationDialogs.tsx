import type { DraftEditorData } from "../../models";
import { Dialog, Notice } from "../../components/ui";
export function DraftPublicationDialogs({
  draft,
  entryCount,
  publish,
  deactivate,
  locked,
  setPublish,
  setDeactivate,
  publishNow,
  setActive,
}: {
  draft: DraftEditorData;
  entryCount: number;
  publish: boolean;
  deactivate: boolean;
  locked: boolean;
  setPublish: (open: boolean) => void;
  setDeactivate: (open: boolean) => void;
  publishNow: () => void;
  setActive: () => void;
}) {
  return (
    <>
      {publish && (
        <Dialog title="Công khai bản nháp" onClose={() => setPublish(false)}>
          <p>
            {draft.revision.name} · {entryCount} từ · phiên bản{" "}
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
