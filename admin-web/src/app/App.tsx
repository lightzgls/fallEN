import { useCallback, useEffect, useRef, useState } from "react";
import {
  DraftProvider,
  logout,
  MutationProvider,
  SessionProvider,
  useMutation,
  useSession,
} from "./contexts";
import { Dialog, MutationBanner, Notice } from "../components/ui";
import { Login } from "../features/auth/Login";
import { Decks } from "../features/content/Decks";
import { DraftEditor } from "../features/content/DraftEditor";
import { Catalog } from "../features/dictionary/Catalog";
import { Imports } from "../features/imports/Imports";
import { SpeechPage } from "../features/config/Speech";
import { Limit, Topics } from "../features/config/AI";
import { Reports } from "../features/reports/Reports";

const navigation = [
  ["/decks", "Bộ từ hệ thống"],
  ["/catalog", "Chọn từ từ điển"],
  ["/imports", "Nhập hàng loạt"],
  ["/speech", "Giọng đọc TTS"],
  ["/topics", "Tình huống AI"],
  ["/limit", "Hạn mức phiên AI"],
  ["/reports", "Báo lỗi học liệu"],
] as const;
export function App() {
  return (
    <SessionProvider>
      <SessionGate />
    </SessionProvider>
  );
}
function SessionGate() {
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
function currentPath() {
  return window.location.hash.replace(/^#/, "") || "/decks";
}
function AdminShell() {
  const session = useSession(),
    mutation = useMutation();
  const [path, setPath] = useState(currentPath),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState<string>(),
    [waitingSave, setWaitingSave] = useState(false),
    [theme, setTheme] = useState(
      () => localStorage.getItem("fallen-admin-theme") || "SYSTEM",
    );
  const pathRef = useRef(path),
    dirtyRef = useRef(dirty);
  pathRef.current = path;
  dirtyRef.current = dirty;
  const onDirty = useCallback((value: boolean) => setDirty(value), []);
  const go = useCallback((next: string) => {
    setDirty(false);
    setPath(next);
    window.history.replaceState(null, "", `#${next}`);
    window.scrollTo(0, 0);
  }, []);
  const navigate = useCallback(
    (next: string) => {
      if (next === pathRef.current) return;
      if (
        dirtyRef.current ||
        mutation.phase === "saving" ||
        mutation.phase === "unknown"
      ) {
        setPending(next);
        return;
      }
      go(next);
    },
    [go, mutation.phase],
  );
  useEffect(() => {
    const onHash = () => {
      const next = currentPath();
      if (next === pathRef.current) return;
      if (dirtyRef.current) {
        window.history.replaceState(null, "", `#${pathRef.current}`);
        setPending(next);
      } else {
        setPath(next);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => {
    if (waitingSave && !dirty && pending) {
      go(pending);
      setPending(undefined);
      setWaitingSave(false);
    }
    if (waitingSave && ["failed", "conflict"].includes(mutation.phase)) {
      setWaitingSave(false);
      setPending(undefined);
    }
  }, [dirty, waitingSave, pending, go, mutation.phase]);
  useEffect(() => {
    localStorage.setItem("fallen-admin-theme", theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "DARK" || (theme === "SYSTEM" && media.matches)
          ? "dark"
          : "light");
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  async function signOut() {
    if (dirty || mutation.phase === "saving" || mutation.phase === "unknown") {
      if (
        !window.confirm("Có thay đổi hoặc lệnh chưa xác nhận. Đăng xuất ngay?")
      )
        return;
    }
    await logout();
  }
  let view;
  const [section, id] = path.replace(/^\//, "").split("/");
  const selected = section === "draft" ? "decks" : section;
  const heading =
    navigation.find(([route]) => route === `/${selected}`)?.[1] ||
    "Bộ từ hệ thống";
  switch (section) {
    case "draft":
      view = <DraftEditor navigate={navigate} onDirty={onDirty} />;
      break;
    case "catalog":
      view = <Catalog navigate={navigate} />;
      break;
    case "imports":
      view = <Imports navigate={navigate} onDirty={onDirty} />;
      break;
    case "speech":
      view = (
        <SpeechPage
          key={id}
          wordId={id ? decodeURIComponent(id) : undefined}
          navigate={navigate}
          onDirty={onDirty}
        />
      );
      break;
    case "topics":
      view = <Topics onDirty={onDirty} />;
      break;
    case "limit":
      view = <Limit onDirty={onDirty} />;
      break;
    case "reports":
      view = (
        <Reports
          key={id}
          reportId={id ? decodeURIComponent(id) : undefined}
          navigate={navigate}
        />
      );
      break;
    default:
      view = <Decks navigate={navigate} />;
  }
  return (
    <div className="admin-layout">
      <a className="skip-link" href="#main-content">
        Đến nội dung
      </a>
      <aside className="sidebar">
        <div className="brand">fallEN</div>
        <p className="nav-caption">QUẢN TRỊ NỘI DUNG</p>
        <nav aria-label="Quản trị nội dung">
          {navigation.map(([route, label]) => (
            <a
              href={`#${route}`}
              key={route}
              aria-current={selected === route.slice(1) ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(route);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <button className="nav-logout" onClick={() => void signOut()}>
          Đăng xuất
        </button>
        <div className="theme-picker">
          <label htmlFor="theme">Giao diện</label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="SYSTEM">Theo hệ thống</option>
            <option value="LIGHT">Sáng</option>
            <option value="DARK">Tối</option>
          </select>
        </div>
      </aside>
      <div className="work-area">
        <header className="topbar">
          <span>Học liệu / {heading}</span>
          <span title={session.user?.email || ""}>Content Admin</span>
        </header>
        <MutationBanner />
        <main id="main-content" className="content" key={path} tabIndex={-1}>
          {view}
        </main>
      </div>
      {pending && !waitingSave && (
        <Dialog
          title={
            mutation.phase === "unknown"
              ? "Lệnh chưa rõ kết quả"
              : "Thay đổi chưa lưu"
          }
          onClose={() => setPending(undefined)}
        >
          <p>
            {mutation.phase === "unknown"
              ? "Kiểm tra kết quả hoặc thử lại cùng mã lệnh trước khi rời màn."
              : "Lưu thay đổi trước khi rời màn này?"}
          </p>
          <div className="actions">
            {!["unknown", "saving"].includes(mutation.phase) && (
              <>
                <button
                  className="primary"
                  onClick={() => {
                    const form = document.querySelector<HTMLFormElement>(
                      "main form[data-dirty-form]",
                    );
                    const save = document.querySelector<HTMLButtonElement>(
                      "main button[data-save]",
                    );
                    if (form || save) {
                      setWaitingSave(true);
                      form?.requestSubmit();
                      save?.click();
                    } else setPending(undefined);
                  }}
                >
                  Lưu / Ở lại để lưu
                </button>
                <button
                  onClick={() => {
                    go(pending);
                    setPending(undefined);
                  }}
                >
                  Bỏ thay đổi
                </button>
              </>
            )}
            <button onClick={() => setPending(undefined)}>Ở lại</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
