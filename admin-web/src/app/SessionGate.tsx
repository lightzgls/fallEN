import { useEffect, useState } from "react";
import {
  DraftProvider,
  logout,
  MutationProvider,
  useSession,
} from "./contexts";
import { Notice } from "../components/ui";
import { Login } from "../features/auth/Login";
import { AdminShell } from "./AdminShell";
export function SessionGate() {
  const session = useSession();
  const [revoked, setRevoked] = useState(false);
  useEffect(() => {
    setRevoked(false);
  }, [session.user?.uid]);
  useEffect(() => {
    const denied = () => setRevoked(true);
    window.addEventListener("fallen-access-denied", denied);
    return () => window.removeEventListener("fallen-access-denied", denied);
  }, []);
  if (session.state === "signed-out") return <Login />;
  if (session.state === "loading")
    return (
      <main className="center-state">
        <div className="brand">fallEN</div>
        <p role="status">Đang xác minh quyền truy cập…</p>
      </main>
    );
  if (session.state === "denied" || revoked)
    return (
      <main className="center-state">
        <div className="brand">fallEN</div>
        <h1>Không có quyền truy cập</h1>
        <p>
          Tài khoản này chưa được cấp quyền quản trị nội dung hoặc quyền truy
          cập đã thay đổi.
        </p>
        <button
          onClick={() => {
            setRevoked(false);
            session.reload();
          }}
        >
          Kiểm tra lại quyền
        </button>
        <button onClick={() => void logout()}>Đăng xuất</button>
      </main>
    );
  if (session.state === "error")
    return (
      <main className="center-state">
        <h1>Chưa xác minh được tài khoản</h1>
        <Notice tone="error">{session.error}</Notice>
        <button onClick={session.reload}>Thử lại</button>
        <button onClick={() => void logout()}>Đăng xuất</button>
      </main>
    );
  return (
    <MutationProvider key={session.user?.uid}>
      <DraftProvider>
        <AdminShell />
      </DraftProvider>
    </MutationProvider>
  );
}
