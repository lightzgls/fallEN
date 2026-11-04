import { navigation } from "./navigation";
export function Sidebar({
  selected,
  navigate,
  theme,
  setTheme,
  onSignOut,
}: {
  selected: string;
  navigate: (path: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
  onSignOut: () => Promise<void>;
}) {
  return (
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
      <button className="nav-logout" onClick={() => void onSignOut()}>
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
  );
}
