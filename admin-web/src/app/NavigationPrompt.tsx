import { Dialog } from "../components/ui";
import type { useAdminNavigation } from "./useAdminNavigation";
export function NavigationPrompt({
  route,
  phase,
}: {
  route: ReturnType<typeof useAdminNavigation>;
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
