import { logout, useMutation, useSession } from "./contexts";
import { MutationBanner } from "../components/Ui";
import { FeatureRoute } from "./FeatureRoute";
import { Sidebar } from "./Sidebar";
import { LeaveDialog } from "./LeaveDialog";
import { navigation } from "./navigation";
import { useNavigation } from "./useNavigation";
import { useTheme } from "./useTheme";

export function Shell() {
  const session = useSession(),
    mutation = useMutation();
  const route = useNavigation(mutation.phase),
    theme = useTheme();
  const section = route.path.replace(/^\//, "").split("/")[0];
  const selected = section === "draft" ? "decks" : section;
  const heading =
    navigation.find(([path]) => path === `/${selected}`)?.[1] ||
    "Bộ từ hệ thống";
  async function signOut() {
    if (
      route.dirty ||
      mutation.phase === "saving" ||
      mutation.phase === "unknown"
    ) {
      if (
        !window.confirm("Có thay đổi hoặc lệnh chưa xác nhận. Đăng xuất ngay?")
      )
        return;
    }
    await logout();
  }
  return (
    <div className="admin-layout">
      <a className="skip-link" href="#main-content">
        Đến nội dung
      </a>
      <Sidebar
        selected={selected}
        navigate={route.navigate}
        {...theme}
        onSignOut={signOut}
      />
      <div className="work-area">
        <header className="topbar">
          <span>Học liệu / {heading}</span>
          <span title={session.user?.email || ""}>Content Admin</span>
        </header>
        <MutationBanner />
        <main
          id="main-content"
          className="content"
          key={route.path}
          tabIndex={-1}
        >
          <FeatureRoute
            path={route.path}
            navigate={route.navigate}
            onDirty={route.onDirty}
          />
        </main>
      </div>
      <LeaveDialog route={route} phase={mutation.phase} />
    </div>
  );
}
