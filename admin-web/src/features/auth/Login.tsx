import { useState, type FormEvent } from "react";
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import {
  auth,
  configurationError,
  emulatorMode,
} from "../../services/firebase";
import { Notice, TextField } from "../../components/Ui";
export function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function login(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setPassword("");
    } catch {
      setError("Không đăng nhập được. Kiểm tra email, mật khẩu và kết nối.");
    } finally {
      setSaving(false);
    }
  }
  async function google() {
    setSaving(true);
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setError("Chưa hoàn tất đăng nhập Google. Có thể thử lại.");
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    if (!email) {
      setError("Nhập email để nhận yêu cầu đặt lại mật khẩu.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage(
        "Nếu email được hỗ trợ, yêu cầu đặt lại mật khẩu đã được gửi.",
      );
    } catch {
      setError("Không gửi được yêu cầu. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand">fallEN</div>
        <h1>Quản trị nội dung</h1>
        {configurationError && (
          <Notice tone="error">{configurationError}</Notice>
        )}
        {emulatorMode && (
          <small className="emulator-label">Môi trường emulator</small>
        )}
        <form onSubmit={login}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            required
            disabled={saving}
          />
          <TextField
            label="Mật khẩu"
            type="password"
            value={password}
            onChange={setPassword}
            required
            disabled={saving}
          />
          {error && <Notice tone="error">{error}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}
          <button
            className="primary full"
            disabled={saving || !!configurationError}
          >
            {saving ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
        <button
          className="full"
          disabled={saving || !!configurationError}
          onClick={() => void google()}
        >
          Tiếp tục với Google
        </button>
        <button className="link" onClick={() => void reset()} disabled={saving}>
          Quên mật khẩu
        </button>
        <small>Quyền quản trị được cấp riêng theo tài khoản.</small>
      </section>
    </main>
  );
}
