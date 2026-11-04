import { Dialog, Notice } from "../../components/Ui";
export function ConfirmImport({
  selectedCount,
  rowCount,
  locked,
  apply,
  onClose,
}: {
  selectedCount: number;
  rowCount: number;
  locked: boolean;
  apply: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Xác nhận dòng sẽ áp dụng" onClose={() => onClose()}>
      <p>
        Áp dụng {selectedCount} dòng; bỏ qua {rowCount - selectedCount} dòng.
      </p>
      <Notice>
        Máy chủ đối chiếu fingerprint, phiên bản danh mục và bản nháp. Lô lỗi có
        thể tiếp tục bằng cùng mã lệnh.
      </Notice>
      <div className="actions">
        <button className="primary" disabled={locked} onClick={apply}>
          Xác nhận áp dụng
        </button>
        <button onClick={() => onClose()} disabled={locked}>
          Quay lại
        </button>
      </div>
    </Dialog>
  );
}
