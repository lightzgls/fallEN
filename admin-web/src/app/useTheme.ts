import { useEffect, useState } from "react";
export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("fallen-admin-theme") || "SYSTEM",
  );
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
  return { theme, setTheme };
}
