import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authService, validEmail } from "../../services/authService";
import { APP_NAME } from "../../data/models";
type Errors = Record<string, string>;
function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field" htmlFor={id}>
      {label}
      <span className="password-input">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => setVisible((v) => !v)}
          aria-label={
            visible
              ? "Hide " + label.toLowerCase()
              : "Show " + label.toLowerCase()
          }
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
      {error && (
        <small id={id + "-error"} className="field-error">
          {error}
        </small>
      )}
    </label>
  );
}
function AuthLayout({
  register = false,
  title,
  subtitle,
  showTeacherNote = true,
  centered = false,
  compact = false,
  children,
}: {
  register?: boolean;
  title?: string;
  subtitle?: string;
  showTeacherNote?: boolean;
  centered?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className={`auth-page${centered ? " auth-page--centered" : " auth-page--split"}${compact ? " auth-page--compact" : ""}`}
    >
      {!centered && (
      <section className="auth-brand-panel" aria-label={`${APP_NAME} introduction`}>
        <div className="auth-wordmark"><img src="/favicon.svg" width="32" height="32" alt="" /><b>{APP_NAME}</b></div>
        <div className="auth-pitch">
          <div className="auth-pitch-copy"><span className="auth-eyebrow">iSQL PRACTICE PLATFORM</span><h2>Write queries.<br /><span>Understand data.</span></h2><p>Practice on real schemas, see the result of every query, and build your SQL skills one problem at a time.</p></div>
          <div className="editor-preview" aria-label="SQL editor preview">
            <div className="preview-bar"><b>join-orders.sql</b><span>Run</span></div>
            <pre><code><i>1</i>  <em>-- Orders per customer</em>{"\n"}<i>2</i>  <strong>SELECT</strong> c.name, COUNT(o.id) <strong>AS</strong> orders{"\n"}<i>3</i>  <strong>FROM</strong> customers c{"\n"}<i>4</i>  <strong>LEFT JOIN</strong> orders o <strong>ON</strong> o.customer_id = c.id{"\n"}<i>5</i>  <strong>GROUP BY</strong> c.name{"\n"}<i>6</i>  <strong>ORDER BY</strong> orders <strong>DESC</strong>;</code></pre>
            <div className="preview-result">
              <table aria-label="Sample query result">
                <thead><tr><th scope="col">name</th><th scope="col">orders</th></tr></thead>
                <tbody>
                  <tr><td>Nguyen An</td><td>4</td></tr>
                  <tr><td>Tran Binh</td><td>3</td></tr>
                  <tr><td>Le Chi</td><td>0</td></tr>
                </tbody>
              </table>
              <b>Accepted · 3 rows · 12 ms</b>
            </div>
          </div>
        </div>
        <small>{APP_NAME} · Viết truy vấn. Hiểu dữ liệu.</small>
      </section>
      )}
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span className="auth-form-eyebrow">{APP_NAME} ACCOUNT</span>
            <h1>{title ?? (register ? "Create your account" : "Welcome back")}</h1>
            <p>
              {subtitle ??
                (register
                  ? "Register with your student email to start practicing SQL."
                  : "Sign in to continue practicing SQL.")}
            </p>
          </div>
          {children}
          {showTeacherNote && (
            <p className="auth-note">
              Teacher accounts are created by an administrator.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const intended = (location.state as { from?: string } | null)?.from;
  const teacherDestination =
    intended && /^\/teacher(?:\/|\?|#|$)/.test(intended) ? intended : null;
  const adminDestination =
    intended && /^\/admin(?:\/|\?|#|$)/.test(intended) ? intended : null;
  const destination =
    intended &&
    /^\/(dashboard|practice|problems|workspace|assignments|contests|submissions)(\/|\?|#|$)/.test(
      intended,
    )
      ? intended
      : "/dashboard";
  async function signIn() {
    if (busy) return;
    setErrors({});
    setMessage("");
    const next: Errors = {};
    if (!validEmail(email.trim())) next.email = "Enter a valid email address.";
    if (!password.trim()) next.password = "Enter a password.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      const user = await auth.login(email.trim(), password);
      navigate(
        user.role === "admin"
          ? adminDestination || "/admin/overview"
          : user.role === "instructor"
            ? teacherDestination || "/teacher/problems"
            : destination,
        { replace: true },
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void signIn();
  }
  return (
    <AuthLayout showTeacherNote={false} centered>
      <form onSubmit={submit} noValidate>
        <label className="field" htmlFor="login-email">
          Email
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <small id="email-error" className="field-error">
              {errors.email}
            </small>
          )}
        </label>
        <PasswordField
          id="login-password"
          label="Password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="current-password"
          placeholder="Enter your password"
        />
        <p className="auth-note">Contact an administrator to reset your password.</p>
        {message && (
          <p role="alert" className="form-message">
            {message}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="auth-switch">
          New student? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter your full name.";
    if (!validEmail(email.trim())) next.email = "Enter a valid school email.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (!confirm || confirm !== password)
      next.confirm = "Passwords must match.";
    setErrors(next);
    setMessage("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await auth.register(name.trim(), email.trim(), password);
      navigate("/dashboard", { replace: true, state: { welcome: true } });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout register centered showTeacherNote={false}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label className="field" htmlFor="register-name">
          Full name
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            placeholder="Nguyen Van A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <small className="field-error">{errors.name}</small>
          )}
        </label>
        <label className="field" htmlFor="register-email">
          Email
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <small className="field-error">{errors.email}</small>
          )}
        </label>
        <PasswordField
          id="register-password"
          label="Password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="new-password"
          placeholder="Create a password"
        />
        <p className="password-requirements">At least 8 characters.</p>
        <PasswordField
          id="register-confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
          autoComplete="new-password"
          placeholder="Re-enter your password"
        />
        {message && (
          <p role="alert" className="form-message">
            {message}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "Creating your account…" : "Create account"}
        </button>
        <p className="auth-switch" style={{ marginBottom: "0.5rem" }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

