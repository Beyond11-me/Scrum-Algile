import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/apiClient";
import { authService } from "../../services/authService";

const PERSON_NAME = /^[A-Za-z ]{2,100}$/;

function collapseName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function cooldownDate() {
  const next = new Date();
  next.setDate(next.getDate() + 30);
  return next.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function AccountPage() {
  const { session, updateSession } = useAuth();
  const [name, setName] = useState(session?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    authService.getProfile().then((profile) => {
      setName(profile.name);
      setLockedUntil(profile.nextProfileChangeAt);
    }).catch(() => setNotice("Could not load your account."));
  }, []);

  const locked = lockedUntil !== null && new Date(lockedUntil).getTime() > Date.now();
  const lockedLabel = lockedUntil ? new Date(lockedUntil).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const nameChanged = collapseName(name) !== collapseName(session?.name ?? "");

  function validate() {
    const next: Record<string, string> = {};
    const cleanName = collapseName(name);
    if (nameChanged && !PERSON_NAME.test(cleanName)) next.name = "Use 2–100 letters and spaces, with no accents or digits.";
    if (newPassword) {
      if (newPassword.length < 8 || newPassword.length > 64 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
        next.newPassword = "Use 8–64 characters with an uppercase letter, a lowercase letter, a digit, and a symbol.";
      }
      if (!currentPassword) next.currentPassword = "Enter your current password.";
    } else if (currentPassword) {
      next.newPassword = "Enter the new password, or clear the current password.";
    }
    if (!nameChanged && !newPassword) next.form = "Change your name or password before saving.";
    return next;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const next = validate();
    setErrors(next);
    setNotice("");
    if (Object.keys(next).length) return;
    setConfirming(true);
  }

  async function save() {
    const cleanName = collapseName(name);
    setBusy(true);
    try {
      const updated = await authService.updateProfile({
        name: nameChanged ? cleanName : session?.name,
        currentPassword: newPassword ? currentPassword : undefined,
        newPassword: newPassword || undefined,
      });
      updateSession(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirming(false);
      const profile = await authService.getProfile();
      setLockedUntil(profile.nextProfileChangeAt);
      setNotice("Saved. You can change your name or password again in 30 days.");
    } catch (err: unknown) {
      setConfirming(false);
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setNotice(err instanceof Error ? err.message : "Could not update your account.");
    } finally {
      setBusy(false);
    }
  }

  const confirmLead = newPassword
    ? "Save this password? Check it once more before continuing."
    : "Save this name?";

  return <div className="self-account-page">
    <form className="self-account-card" onSubmit={submit} noValidate>
      <header>
        <h1>Your account</h1>
        <p>{session?.email}</p>
        <p>You can change your name and password once every 30 days.</p>
      </header>
      {locked && <p className="admin-notice" role="status">You can change your name or password again on {lockedLabel}.</p>}
      <section className="self-account-section">
        <h2>Name</h2>
        <label className="admin-field"><span>FULL NAME</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} disabled={locked || busy} aria-invalid={!!errors.name} />{errors.name && <small className="field-error">{errors.name}</small>}</label>
      </section>
      <section className="self-account-section">
        <h2>Password</h2>
        <label className="admin-field"><span>CURRENT PASSWORD</span><input type={showPassword ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" disabled={locked || busy} aria-invalid={!!errors.currentPassword} />{errors.currentPassword && <small className="field-error">{errors.currentPassword}</small>}</label>
        <label className="admin-field"><span>NEW PASSWORD</span><input type={showPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} maxLength={64} autoComplete="new-password" placeholder="Leave blank to keep the current password" disabled={locked || busy} aria-invalid={!!errors.newPassword} />{errors.newPassword && <small className="field-error">{errors.newPassword}</small>}</label>
        <p className="self-account-hint">Use 8–64 characters with an uppercase letter, a lowercase letter, a digit, and a symbol.</p>
        <button type="button" className="text-button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide passwords" : "Show passwords"}</button>
      </section>
      {errors.form && <p className="admin-warning" role="alert">{errors.form}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <div className="admin-edit-actions"><button className="button primary" disabled={locked || busy}>{busy ? "Saving..." : "Save changes"}</button></div>
    </form>
    {confirming && <Dialog title="Confirm this change" onClose={() => setConfirming(false)} className="admin-dialog">
      <div className="admin-dialog-form">
        <p>{confirmLead}</p>
        <p>This starts a 30-day wait. You cannot change your name or password again until {cooldownDate()}.</p>
        <div className="admin-dialog-actions">
          <button type="button" className="button" onClick={() => setConfirming(false)} disabled={busy}>Go back</button>
          <button type="button" className="button primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving..." : "Yes, save"}</button>
        </div>
      </div>
    </Dialog>}
  </div>;
}
