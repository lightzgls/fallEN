import { Dialog } from "../components/Ui";
import type { useNavigation } from "./useNavigation";
export function LeaveDialog({
  route,
  phase,
}: {
  route: ReturnType<typeof useNavigation>;
  phase: string;
}) {
  const {
    pending,
    waitingSave,
    closePending,
    saveBeforeLeaving,
    discardAndLeave,
  } = route;
  return (
    <>
      {pending && !waitingSave && (
        <Dialog
          title={
            phase === "unknown" ? "Lệnh chưa rõ kết quả" : "Thay đổi chưa lưu"
          }
          onClose={() => closePending()}
        >
          <p>
            {phase === "unknown"
              ? "Kiểm tra kết quả hoặc thử lại cùng mã lệnh trước khi rời màn."
              : "Lưu thay đổi trước khi rời màn này?"}
          </p>
          <div className="actions">
            {!["unknown", "saving"].includes(phase) && (
              <>
                <button className="primary" onClick={saveBeforeLeaving}>
                  Lưu / Ở lại để lưu
                </button>
                <button onClick={discardAndLeave}>Bỏ thay đổi</button>
              </>
            )}
            <button onClick={() => closePending()}>Ở lại</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
