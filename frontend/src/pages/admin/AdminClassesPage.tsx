import { SelectMenu } from "../../components/SelectMenu";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Eye, EyeOff, Search } from "lucide-react";
import { PasswordChecklist, PasswordInput } from "../../components/PasswordInput";
import { passwordRequirements } from "../../utils/passwordRequirements";
import { Dialog, Empty, ErrorState, Loading } from "../../components/ui";
import { AdminOnlyButton } from "../../components/withRoleAccess";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/apiClient";
import {
  adminCapabilities,
  defaultAdminRolePolicy,
  type AdminClass,
  type AdminPracticeProblem,
  type AdminRoleName,
} from "../../data/adminPolicy";
import { PersonIdentity, SearchablePersonMenu, type PersonOption } from "../../components/SearchablePersonMenu";
import { adminService, type AdminUser, type LecturerOption } from "../../services/adminService";
import { teacherService } from "../../services/teacherService";
import type { TeacherClassMember } from "../../data/teacherTypes";
import { studentApi } from "../../services/studentApi";
import { academicTerms, classDateError, CLASS_DATE_MAX, CLASS_DATE_MIN, formatClassDateRange } from "../../utils/academicTerms";
import { localTime, parseServerDateTime } from "../../utils/serverDateTime";
import { downloadCsv } from "../../utils/rosterCsv";

const PERSON_NAME = /^[A-Za-z ]{2,100}$/;
const ACCOUNT_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function collapseName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function formFields(error: unknown) {
  return error instanceof ApiError ? error.fields : {};
}

function PageIntro({ title, sub, children, compact = false }: { title: string; sub?: string; children?: ReactNode; compact?: boolean }) {
  return <div className={`admin-page-intro${compact ? " page-list-intro" : ""}`}><div><h1 className={compact ? "sr-only" : undefined}>{title}</h1>{sub && <p>{sub}</p>}</div>{children && <div className="admin-page-actions">{children}</div>}</div>;
}

function Split({ main, side, className = "" }: { main: ReactNode; side: ReactNode; className?: string }) {
  return <div className={`admin-split ${className}`}><section className="admin-primary">{main}</section><aside className="admin-side">{side}</aside></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="admin-field"><span>{label}</span>{children}</label>;
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="admin-notice" role="status">{children}</p>;
}

function LecturerSlot({ lecturer, onChange, changeLabel = "Change", disabled = false }: { lecturer: PersonOption | null; onChange: () => void; changeLabel?: string; disabled?: boolean }) {
  return <section className="lecturer-slot">
    <span className="lecturer-slot-label">Lecturer</span>
    {lecturer ? <div className="lecturer-slot-card">
      <PersonIdentity name={lecturer.name} id={lecturer.id} email={lecturer.email} />
      <button type="button" className="lecturer-slot-change" disabled={disabled} onClick={onChange}>{changeLabel}</button>
    </div> : <button type="button" className="lecturer-slot-empty" disabled={disabled} onClick={onChange}>
      <span>No lecturer assigned</span>
      <b>{changeLabel === "Change" ? "Assign lecturer" : changeLabel}</b>
    </button>}
  </section>;
}

function findLecturer(lecturers: LecturerOption[], id?: string, fallbackName?: string): PersonOption | null {
  if (!id || id === "Unassigned") return null;
  return lecturers.find((item) => item.id === id) || (fallbackName && fallbackName !== "Unassigned" ? { id, name: fallbackName } : null);
}

function AddUserDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (user: AdminUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("Student");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const cleanName = collapseName(name);
    const cleanEmail = email.trim().toLowerCase();
    if (!PERSON_NAME.test(cleanName)) next.name = "Use 2–100 letters and spaces, with no accents or digits.";
    if (!cleanEmail || cleanEmail.length > 255 || !ACCOUNT_EMAIL.test(cleanEmail)) next.email = "Enter a valid email address.";
    if (!passwordRequirements(password, "admin")[0].met) next.password = "Use 8–64 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const newUser = await adminService.createUser({ name: cleanName, email: cleanEmail, role, password });
      onAdd(newUser);
    } catch (err: unknown) {
      const fields = formFields(err);
      setErrors(Object.keys(fields).length ? fields : { form: err instanceof Error ? err.message : "Failed to create user" });
    } finally {
      setLoading(false);
    }
  }

  return <Dialog title="Add user" onClose={onClose} className="admin-dialog"><form onSubmit={submit} className="admin-dialog-form" noValidate>
    <Field label="NAME"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyen Van An" maxLength={100} aria-invalid={!!errors.name} />{errors.name && <small className="field-error">{errors.name}</small>}</Field>
    <Field label="EMAIL"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.edu" maxLength={255} aria-invalid={!!errors.email} />{errors.email && <small className="field-error">{errors.email}</small>}</Field>
    <Field label="PASSWORD"><PasswordInput label="password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((previous) => ({ ...previous, password: "" })); }} placeholder="At least 8 characters" maxLength={64} autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="add-user-password-requirements" />{errors.password && <small className="field-error">{errors.password}</small>}</Field>
    <PasswordChecklist id="add-user-password-requirements" password={password} policy="admin" />
    <Field label="ROLE"><SelectMenu value={role} onChange={(e) => setRole(e.target.value as AdminUser["role"])}><option>Student</option><option>Lecturer</option><option>Admin</option></SelectMenu></Field>
    {errors.form && <p className="admin-warning" style={{ margin: 0 }}>{errors.form}</p>}
    <div className="admin-dialog-actions"><button type="button" className="button" onClick={onClose} disabled={loading}>Cancel</button><button className="button primary" disabled={loading}>{loading ? "Adding..." : "Add user"}</button></div>
  </form></Dialog>;
}

function ResetPasswordDialog({ email, name, onClose }: { email: string; name: string; onClose: (notice?: string, password?: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [generated, setGenerated] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setErrors({});
    try {
      const result = await adminService.resetPassword(email, { generate: true });
      setGenerated(result.password || "");
      setPassword("");
      setConfirm("");
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : "Could not generate a password." });
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!passwordRequirements(password, "admin")[0].met) next.password = "Use 8–64 characters.";
    if (password !== confirm) next.confirm = "Passwords must match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await adminService.resetPassword(email, { password });
      onClose(`Password reset for ${name}. The new password stays visible on this account.`, password);
    } catch (err: unknown) {
      const fields = formFields(err);
      setErrors(Object.keys(fields).length ? fields : { form: err instanceof Error ? err.message : "Could not reset the password." });
      setBusy(false);
    }
  }

  return <Dialog title="Reset password" onClose={() => onClose(undefined, generated || undefined)} className="admin-dialog">
    {generated ? <div className="admin-dialog-form">
      <p>The new password for <strong>{name}</strong> is saved. It stays visible in the account list.</p>
      <p className="admin-detail-title">{generated}</p>
      <div className="admin-dialog-actions"><button type="button" className="button primary" onClick={() => onClose(`Password reset for ${name}.`, generated)}>Close</button></div>
    </div> : <form onSubmit={submit} className="admin-dialog-form" noValidate>
      <p className="admin-muted">{name} · {email}</p>
      <Field label="NEW PASSWORD"><PasswordInput label="new password" value={password} onChange={(event) => { setPassword(event.target.value); setErrors((previous) => ({ ...previous, password: "", confirm: "" })); }} maxLength={64} autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby="reset-password-requirements" />{errors.password && <small className="field-error">{errors.password}</small>}</Field>
      <Field label="CONFIRM PASSWORD"><PasswordInput label="confirm password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setErrors((previous) => ({ ...previous, confirm: "" })); }} maxLength={64} autoComplete="new-password" aria-invalid={!!errors.confirm} aria-describedby="reset-password-requirements" />{errors.confirm && <small className="field-error">{errors.confirm}</small>}</Field>
      <PasswordChecklist id="reset-password-requirements" password={password} policy="admin" confirm={confirm} />
      {errors.form && <p className="admin-warning" style={{ margin: 0 }}>{errors.form}</p>}
      <div className="admin-dialog-actions"><button type="button" className="button" onClick={generate} disabled={busy}>Generate password</button><button className="button primary" disabled={busy}>{busy ? "Saving..." : "Reset password"}</button></div>
    </form>}
  </Dialog>;
}

function RemoveAccountDialog({ user, onClose, onRemoved }: { user: AdminUser; onClose: () => void; onRemoved: () => void }) {
  const [typed, setTyped] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = typed.trim() === user.email && accepted && !busy;

  async function remove() {
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      await adminService.deleteUser(user.email, typed.trim());
      onRemoved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not remove this account.");
      setBusy(false);
    }
  }

  return <Dialog title="Remove account permanently" onClose={onClose} className="admin-dialog admin-remove-dialog">
    <div className="admin-dialog-form">
      <p>This permanently deletes <strong>{user.name}</strong> ({user.email}). They will not be able to sign in again.</p>
      <p>Their submissions, drafts, favorites, lists, notifications, and class enrollments are deleted. Classes and assignments they teach stay, but no longer list them as the lecturer. Problems they created stay on the platform.</p>
      <p>This cannot be undone. Deactivate the account instead if you only need to block sign-in.</p>
      <Field label="TYPE THE ACCOUNT EMAIL"><input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} aria-invalid={typed.length > 0 && typed.trim() !== user.email} /></Field>
      <label className="admin-confirm-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>I understand this permanently deletes the account and cannot be undone.</span></label>
      {error && <p className="admin-warning" role="alert">{error}</p>}
      <div className="admin-dialog-actions"><button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="button admin-reject-button" disabled={!ready} onClick={() => void remove()}>{busy ? "Removing..." : "Remove account"}</button></div>
    </div>
  </Dialog>;
}

function passwordText(password: string | undefined, visible: boolean) {
  if (!password) return "Not on file";
  return visible ? password : "••••••••";
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function AdminListPagination({ total, page, onPageChange, label, noun, alwaysVisible = false }: { total: number; page: number; onPageChange: (page: number) => void; label: string; noun: string; alwaysVisible?: boolean }) {
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * pageSize;
  return <div className="admin-list-table-footer">
    <p className="admin-table-footer" role="status">Showing {total === 0 ? 0 : firstIndex + 1}–{Math.min(firstIndex + pageSize, total)} of {total.toLocaleString()} {noun}</p>
    {(pageCount > 1 || alwaysVisible) && <nav className="admin-table-pagination" aria-label={label}>
      <button type="button" className="button admin-button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>← Previous</button>
      <span>Page {currentPage} of {pageCount}</span>
      <button type="button" className="button admin-button" disabled={currentPage === pageCount} onClick={() => onPageChange(currentPage + 1)}>Next →</button>
    </nav>}
  </div>;
}

export function AdminUsersPage() {
  const location = useLocation();
  const { session } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All roles");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [dialog, setDialog] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminUser | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    adminService.getUsers().then(data => {
      setUsers(data);
      if (data.length > 0) {
        setSelectedEmail(current => current || data[0].email);
      }
      setLoading(false);
    }).catch(err => {
      setLoadError(err instanceof Error ? err.message : "Failed to load users.");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    const state = location.state as { selectedEmail?: string; notice?: string } | null;
    if (state?.selectedEmail) {
      setSelectedEmail(state.selectedEmail);
      const userIndex = filtered.findIndex(user => user.email === state.selectedEmail);
      if (userIndex >= 0) setPage(Math.floor(userIndex / pageSize) + 1);
    }
    if (state?.notice) setNotice(state.notice);
    if (state) window.history.replaceState({}, document.title);
  }, [location.state, loading]);

  const filtered = useMemo(() => users.filter((user) => {
    const matchesQuery = `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (roleFilter === "All roles" || user.role === roleFilter) && (statusFilter === "All statuses" || user.status === statusFilter);
  }), [users, query, roleFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * pageSize;
  const pageUsers = filtered.slice(firstIndex, firstIndex + pageSize);
  const selected = pageUsers.find((user) => user.email === selectedEmail) || pageUsers[0];

  useEffect(() => {
    setPendingRole(null);
  }, [selected?.email]);

  useEffect(() => {
    setPage(current => Math.min(current, pageCount));
  }, [pageCount]);

  async function handleUpdateRole(userToUpdate: AdminUser, newRole: string) {
    try {
      const updated = await adminService.updateUser(userToUpdate.email, { ...userToUpdate, role: newRole });
      setUsers(all => all.map(u => u.email === updated.email ? updated : u));
    } catch (err: any) {
      setNotice(err.message || "Failed to update role");
    }
  }

  function exportCsv() {
    const csv = ["Name,Email,Role,Status,Password", ...users.map((u) => [u.name, u.email, u.role, u.status, u.password || ""].map(csvCell).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "uit-sql-users.csv"; link.click(); URL.revokeObjectURL(url);
  }

  function revealNewAccount() {
    setQuery("");
    setRoleFilter("All roles");
    setStatusFilter("All statuses");
    setPage(1);
  }

  async function importCsv(file: File) {
    setImporting(true);
    setNotice("");
    try {
      const result = await adminService.importUsers(file);
      downloadCsv("account-import-result.csv", result.reportCsv);
      const data = await adminService.getUsers();
      setUsers(data);
      revealNewAccount();
      setNotice(`${result.created} created · ${result.duplicates} duplicates · ${result.invalid} invalid. The result file lists each password once.`);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Could not import accounts.");
    } finally {
      setImporting(false);
    }
  }

  const ownAccount = selected?.email.toLowerCase() === session?.email.toLowerCase();

  if (loading) return <div className={"admin-page compact-tables-page compact-admin-list-page" + (showUserDetails ? " show-user-details" : "")}><h1 className="sr-only">Users</h1><Loading label="Loading users…" /></div>;
  if (loadError) return <div className={"admin-page compact-tables-page compact-admin-list-page" + (showUserDetails ? " show-user-details" : "")}><h1 className="sr-only">Users</h1><ErrorState title="Could not load users" message={loadError} onRetry={() => window.location.reload()} /></div>;
  return <div className={"admin-page compact-tables-page compact-admin-list-page admin-users-page" + (showUserDetails ? " show-user-details" : "")}>
    <div className="admin-users-toolbar">
      <div className="admin-users-heading"><h1>Users</h1><p>Search accounts, then open one to manage its access.</p></div>
      <div className="admin-user-actions">
        <div className="admin-csv-group" role="group" aria-label="CSV files">
          <span>CSV</span>
          <button type="button" className="button admin-button" title="Download a blank CSV" onClick={() => downloadCsv("account-import-template.csv", "email,role\r\n26520598@gm.uit.edu.vn,Student\r\n")}>Template</button>
          <AdminOnlyButton className="button admin-button" title="Create accounts from a CSV" disabled={importing} onClick={() => fileInput.current?.click()}>{importing ? "Importing..." : "Import"}</AdminOnlyButton>
          <button type="button" className="button admin-button" title="Download every account" onClick={exportCsv} disabled={users.length === 0}>Export</button>
        </div>
        <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importCsv(file); }} />
        <AdminOnlyButton className="button primary admin-button" onClick={() => setDialog(true)}>Add user</AdminOnlyButton>
      </div>
      <div className="admin-user-filters">
        <Field label="SEARCH"><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search name or email..." /></Field>
        <Field label="ROLE"><SelectMenu value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}><option>All roles</option><option>Student</option><option>Lecturer</option><option>Admin</option></SelectMenu></Field>
        <Field label="STATUS"><SelectMenu value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option>Active</option><option>All statuses</option><option>Inactive</option></SelectMenu></Field>
      </div>
    </div>
    {notice && <Notice>{notice}</Notice>}
    <Split main={<>
      <div className="admin-table-wrap compact-table-scroll" role="region" aria-label="Users table" tabIndex={0}><table className="admin-table admin-users-table"><thead><tr><th>NAME / EMAIL</th><th>ROLE</th><th>STATUS</th><th>LAST ACTIVE</th><th>JOINED</th></tr></thead><tbody>
        {pageUsers.map((user) => <tr key={user.email} className={selected?.email === user.email ? "is-selected" : ""} onClick={() => { setSelectedEmail(user.email); setShowUserDetails(true); }}>
          <td data-label="NAME / EMAIL"><Link className="admin-row-link" to={`/admin/users/${encodeURIComponent(user.email)}/edit`}>{user.name}</Link><small>{user.email}</small></td><td data-label="ROLE">{user.role}</td><td data-label="STATUS" className={user.status === "Active" ? "admin-success" : ""}>{user.status}</td><td data-label="LAST ACTIVE">{user.lastActive}</td><td data-label="JOINED">{user.joined}</td>
        </tr>)}
      </tbody></table>
        {filtered.length === 0 && <Empty title={users.length === 0 ? "No accounts yet" : "No users found."}>{users.length === 0 ? "Add a user to get started." : "Try a different search or filter."}</Empty>}
      </div>
      <div className="admin-compact-list-footer">
        <div className="admin-compact-list-controls">
          <span role="status">Showing {filtered.length === 0 ? 0 : firstIndex + 1}–{Math.min(firstIndex + pageSize, filtered.length)} of {filtered.length.toLocaleString()} accounts</span>
          {pageCount > 1 && <nav className="admin-table-pagination" aria-label="User pages">
            <button type="button" className="button admin-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>← Previous</button>
            <span>Page {currentPage} of {pageCount}</span>
            <button type="button" className="button admin-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next →</button>
          </nav>}
        </div>
      </div>
    </>} side={selected ? <>
      <div className="admin-compact-panel-header"><h2>Account details</h2><button type="button" className="text-button compact-panel-back" onClick={() => setShowUserDetails(false)}>Back to users</button></div><h3 className="admin-detail-title"><Link className="title-link" to={`/admin/users/${encodeURIComponent(selected.email)}/edit`}>{selected.name}</Link></h3><p className="admin-muted">{selected.email}</p><div className="admin-detail-divider" />
      <Field label="ROLE"><SelectMenu value={pendingRole ?? selected.role} disabled={ownAccount} onChange={(e) => setPendingRole(e.target.value)}><option>Student</option><option>Lecturer</option><option>Admin</option></SelectMenu></Field>
      {ownAccount && <p className="admin-muted">You cannot change your own role here.</p>}
      {pendingRole && pendingRole !== selected.role && !ownAccount && (
        <button className="button primary admin-button" style={{ marginBottom: "1rem" }} onClick={() => { handleUpdateRole(selected, pendingRole); setPendingRole(null); }}>Save role</button>
      )}
      <p className={selected.status === "Active" ? "admin-success admin-detail-status" : "admin-warning admin-detail-status"}>{selected.status} · Joined {selected.joined}</p>
      <div className="admin-button-stack"><Link className="button admin-button" to={`/admin/users/${encodeURIComponent(selected.email)}/edit`}>Edit account</Link><button type="button" className="button admin-button" onClick={() => setResetTarget(selected)}>Reset password</button>{!ownAccount && <button type="button" className="button admin-reject-button" onClick={() => setRemoveTarget(selected)}>Remove account</button>}</div>
    </> : <><h2>Account details</h2><p className="admin-muted">Select an account to review its access.</p></>} />
    {dialog && <AddUserDialog onClose={() => setDialog(false)} onAdd={(user) => { setUsers((all) => [user, ...all]); setSelectedEmail(user.email); revealNewAccount(); setDialog(false); setNotice(`${user.name} was added successfully.`); }} />}
    {resetTarget && <ResetPasswordDialog email={resetTarget.email} name={resetTarget.name} onClose={(message, nextPassword) => { const email = resetTarget.email; setResetTarget(null); if (nextPassword) setUsers((all) => all.map((user) => user.email === email ? { ...user, password: nextPassword } : user)); if (message) setNotice(message); }} />}
    {removeTarget && <RemoveAccountDialog user={removeTarget} onClose={() => setRemoveTarget(null)} onRemoved={() => { const email = removeTarget.email; setUsers((all) => all.filter((user) => user.email !== email)); setRemoveTarget(null); setNotice(`Removed ${email}. This cannot be undone.`); }} />}
  </div>;
}

export function AdminEditAccountPage() {
  const { email: encodedEmail = "" } = useParams();
  const email = decodeURIComponent(encodedEmail);
  const navigate = useNavigate();
  const { session } = useAuth();

  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [name, setName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("Student");
  const [status, setStatus] = useState<AdminUser["status"]>("Active");
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [confirmDeactivationSave, setConfirmDeactivationSave] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    adminService.getUsers().then(users => {
      const found = users.find(u => u.email === email);
      if (found) {
        setCurrentUser(found);
        setName(found.name);
        setAccountEmail(found.email);
        setRole(found.role);
        setStatus(found.status === "Inactive" ? "Inactive" : "Active");
      }
    }).catch(err => setLoadError(err instanceof Error ? err.message : "Could not load account.")).finally(() => setLoading(false));
  }, [email]);

  if (loading) return <div className="admin-page"><Loading label="Loading account…" /></div>;
  if (loadError) return <div className="admin-page"><PageIntro title="Could not load account" /><Notice>{loadError}</Notice><Link className="button admin-button" to="/admin/users">Back to users</Link></div>;
  if (!currentUser) return <div className="admin-page"><PageIntro title="Account not found" /><p className="admin-muted">This account may have been removed or its email has changed.</p><Link className="button admin-button" to="/admin/users">Back to users</Link></div>;

  async function persistAccount() {
    if (!currentUser) return;
    const nextName = collapseName(name);
    const nextEmail = accountEmail.trim().toLowerCase();
    const next: Record<string, string> = {};
    if (nextName !== collapseName(currentUser.name) && !PERSON_NAME.test(nextName)) next.name = "Use 2–100 letters and spaces, with no accents or digits.";
    if (!nextEmail || nextEmail.length > 255 || !ACCOUNT_EMAIL.test(nextEmail)) next.email = "Enter a valid email address.";
    setErrors(next);
    if (Object.keys(next).length) { setConfirmDeactivationSave(false); return; }
    const isSelf = currentUser.email.toLowerCase() === session?.email.toLowerCase();

    setConfirmDeactivationSave(false);
    setSaving(true);
    try {
      await adminService.updateUser(currentUser.email, {
        name: nextName === collapseName(currentUser.name) ? currentUser.name : nextName,
        email: nextEmail,
        role: isSelf ? currentUser.role : role,
        status: isSelf ? currentUser.status : status
      });
      navigate("/admin/users", { state: { selectedEmail: nextEmail, notice: `Account updated for ${nextName}.` } });
    } catch (err: unknown) {
      const fields = formFields(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setNotice(err instanceof Error ? err.message : "Failed to update account.");
      setSaving(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (currentUser?.status !== "Inactive" && status === "Inactive") {
      setConfirmDeactivationSave(true);
      return;
    }
    void persistAccount();
  }


  return <div className="admin-page">
    <div className="admin-edit-layout admin-account-edit-layout">
      <form className="admin-edit-form" onSubmit={save}>
        <div className="admin-account-form-header">
          <div><h1>Account information</h1><p className="admin-muted">Update this user’s profile, role, and sign-in status.</p></div>
          <Link className="button admin-button" to="/admin/users">Back to users</Link>
        </div>
        <div className="admin-account-fields">
          <Field label="FULL NAME"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} aria-invalid={!!errors.name} />{errors.name && <small className="field-error">{errors.name}</small>}</Field>
          <Field label="EMAIL ADDRESS"><input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} maxLength={255} aria-invalid={!!errors.email} />{errors.email && <small className="field-error">{errors.email}</small>}</Field>
          <Field label="ROLE"><SelectMenu value={role} disabled={currentUser.email.toLowerCase() === session?.email.toLowerCase()} onChange={(event) => setRole(event.target.value as AdminUser["role"])}><option>Student</option><option>Lecturer</option><option>Admin</option></SelectMenu></Field>
          <Field label="ACCOUNT STATUS"><SelectMenu value={status} disabled={currentUser.email.toLowerCase() === session?.email.toLowerCase()} onChange={(event) => setStatus(event.target.value as AdminUser["status"])}><option>Active</option><option>Inactive</option></SelectMenu></Field>
        </div>
        <div className="account-secret">
          <div><span>Password</span><button type="button" className="password-visibility" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} disabled={!currentUser.password} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}</button></div>
          <code>{passwordText(currentUser.password, showPassword)}</code>
          {!currentUser.password && <small>No password on file. Use Reset password to set one.</small>}
        </div>
        {currentUser.email.toLowerCase() === session?.email.toLowerCase() && <p className="admin-muted">You cannot change your own role, deactivate your own account, or remove it.</p>}
        {notice && <Notice>{notice}</Notice>}
        <div className="admin-edit-actions"><button type="button" className="button admin-button" onClick={() => setResetOpen(true)}>Reset password</button>{currentUser.email.toLowerCase() !== session?.email.toLowerCase() && <button type="button" className="button admin-reject-button" onClick={() => setRemoveOpen(true)}>Remove account</button>}<Link className="button admin-button" to="/admin/users">Cancel</Link><button className="button primary admin-button" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button></div>
      </form>
    </div>
    {resetOpen && <ResetPasswordDialog email={currentUser.email} name={currentUser.name} onClose={(message, nextPassword) => { setResetOpen(false); if (nextPassword) setCurrentUser((user) => user ? { ...user, password: nextPassword } : user); if (message) setNotice(message); }} />}
    {removeOpen && <RemoveAccountDialog user={currentUser} onClose={() => setRemoveOpen(false)} onRemoved={() => navigate("/admin/users", { state: { notice: `Removed ${currentUser.email}. This cannot be undone.` } })} />}
    {confirmDeactivationSave && <Dialog title="Deactivate account" onClose={() => setConfirmDeactivationSave(false)} className="admin-dialog">
      <div className="admin-dialog-form">
        <p>Save these changes and deactivate <strong>{currentUser.name}</strong> ({currentUser.email})? They will no longer be able to sign in. Their classes and submissions will be retained.</p>
        <div className="admin-dialog-actions"><button type="button" className="button" onClick={() => setConfirmDeactivationSave(false)}>Cancel</button><button type="button" className="button admin-reject-button" onClick={() => void persistAccount()}>Save and deactivate</button></div>
      </div>
    </Dialog>}
  </div>;
}

export function AdminRolesPage() {
  const [selectedRole, setSelectedRole] = useState<AdminRoleName>("Lecturer");
  const policy = defaultAdminRolePolicy;
  const roleInfo: Record<AdminRoleName, { title: string; description: string }> = {
    Student: { title: "Learning access", description: "Run and submit SQL for assigned work, and practice from the shared problem library." },
    Lecturer: { title: "Teaching access", description: "Create problems, assign work and review results in assigned classes." },
    Admin: { title: "System access", description: "Manage accounts, courses, classes, the Practice catalog, and platform activity." },
  };
  const enabledCount = adminCapabilities.filter(({ key }) => policy.permissions[key]?.[selectedRole]).length;
  return <div className="admin-page admin-roles-page">
    <h1 className="sr-only">Roles &amp; permissions</h1>
    <Split main={<div className="admin-table-wrap sticky-list-table-wrap"><table className="admin-table sticky-list-table admin-permissions-table"><thead><tr><th>CAPABILITY</th><th>STUDENT</th><th>LECTURER</th><th>ADMIN</th></tr></thead><tbody>{adminCapabilities.map(({ key, label }) => <tr key={key}><td data-label="CAPABILITY">{label}</td>{(["Student", "Lecturer", "Admin"] as const).map((role) => {
      const enabled = policy.permissions[key]?.[role] ?? false;
      return <td data-label={role.toUpperCase()} key={role}><span className={enabled ? "admin-success" : "admin-muted"}>{enabled ? "Allowed" : "—"}</span></td>;
    })}</tr>)}</tbody></table></div>} side={<>
      <div className="admin-role-tabs">{(["Student", "Lecturer", "Admin"] as const).map((role) => <button type="button" key={role} className={selectedRole === role ? "active" : ""} onClick={() => setSelectedRole(role)}>{role}</button>)}</div>
      <h3 className="admin-detail-title">{roleInfo[selectedRole].title}</h3><p className="admin-muted">{roleInfo[selectedRole].description}</p><div className="admin-detail-divider" /><h3 className="admin-subheading">Effective access</h3>
      <p className="admin-role-summary">{enabledCount} of {adminCapabilities.length} capabilities enabled</p>
      <dl className="teacher-list-detail-facts"><div><dt>Class access</dt><dd>{policy.scopes[selectedRole].classAccess}</dd></div><div><dt>Problem access</dt><dd>{policy.scopes[selectedRole].problemAccess}</dd></div></dl>
      <p className="admin-muted">This guide describes intended product roles. The server enforces access; these detailed capability labels are not fetched from it.</p>
    </>} />
  </div>;
}

function CourseDialog({ onClose, onCreate, error, busy }: { onClose: () => void; onCreate: (id: string, course: string, term: string) => void; error: string; busy: boolean }) {
  const [newClassForm, setNewClassForm] = useState({
    id: "",
    course: "",
    term: ""
  });

  return (
    <Dialog title="Create a new class" onClose={onClose}>
      <form className="teacher-manage-dialog" onSubmit={(e) => { e.preventDefault(); if (newClassForm.id.trim() && newClassForm.course.trim() && newClassForm.term) onCreate(newClassForm.id.trim(), newClassForm.course.trim(), newClassForm.term); }}>
        <p className="tiny muted">Set up a new class or section</p>

        <label className="teacher-field" style={{ marginTop: "1rem" }}>
          <span>CLASS CODE</span>
          <input required autoFocus value={newClassForm.id} onChange={e => setNewClassForm({ ...newClassForm, id: e.target.value })} placeholder="E.g. IS207.R14" />
        </label>

        <label className="teacher-field">
          <span>COURSE NAME</span>
          <input required value={newClassForm.course} onChange={e => setNewClassForm({ ...newClassForm, course: e.target.value })} placeholder="E.g. Web Development" />
        </label>

        <label className="teacher-field">
          <span>TERM</span>
          <SelectMenu required value={newClassForm.term} onChange={e => setNewClassForm({ ...newClassForm, term: e.target.value })}>
            <option value="" disabled>Select a term...</option>
            {academicTerms().map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </SelectMenu>
        </label>

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button type="button" className="button" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy} type="submit">{busy ? "Creating…" : "Create class"}</button>
        </div>
        {error && <p className="admin-notice" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

export function AdminCoursesPage() {
  const location = useLocation();
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showCourseDetails, setShowCourseDetails] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [semester, setSemester] = useState("All semesters");
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lecturers, setLecturers] = useState<LecturerOption[]>([]);
  const [lecturerQuery, setLecturerQuery] = useState("");
  const [pickingLecturer, setPickingLecturer] = useState(false);
  const [assigningLecturer, setAssigningLecturer] = useState(false);

  useEffect(() => {
    Promise.all([adminService.getClasses(), adminService.getLecturers()]).then(([classesData, lecturerData]) => {
      setClasses(classesData);
      setLecturers(lecturerData);
      if (classesData.length > 0 && !selectedId) {
        setSelectedId(classesData[0].id);
      }
    }).catch((error) => setLoadError(error instanceof Error ? error.message : "Could not load classes.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPickingLecturer(false);
    setLecturerQuery("");
  }, [selectedId]);


  useEffect(() => {
    if (loading) return;
    const state = location.state as { selectedId?: string; notice?: string } | null;
    if (state?.selectedId) {
      setSelectedId(state.selectedId);
      const index = visible.findIndex(item => item.id === state.selectedId);
      if (index >= 0) setPage(Math.floor(index / pageSize) + 1);
    }
    if (state?.notice) setNotice(state.notice);
    if (state) window.history.replaceState({}, document.title);
  }, [location.state, loading]);

  const visible = classes.filter((item) =>
    `${item.course} ${item.id} ${item.lecturer}`.toLowerCase().includes(query.toLowerCase()) &&
    (semester === "All semesters" || item.semester === semester));
  const semesters = [...new Set(classes.map((item) => item.semester).filter(Boolean))].sort().reverse();
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageClasses = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = classes.find((item) => item.id === selectedId) || pageClasses[0];

  async function assignLecturer(lecturerId: string, label: string) {
    if (!selected || assigningLecturer) return;
    setAssigningLecturer(true);
    try {
      const updated = await adminService.updateClass(selected.id, { lecturerId });
      setClasses((all) => all.map((item) => item.id === selected.id ? updated : item));
      setPickingLecturer(false);
      setLecturerQuery("");
      setNotice(lecturerId === "Unassigned" ? `${selected.id} is unassigned.` : `${label} assigned to ${selected.id}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not assign lecturer.");
    } finally {
      setAssigningLecturer(false);
    }
  }

  useEffect(() => { setPage(current => Math.min(current, pageCount)); }, [pageCount]);

  if (loading) return <div className="admin-page compact-tables-page compact-admin-list-page admin-course-page"><h1 className="sr-only">Courses & classes</h1><Loading label="Loading courses and classes…" /></div>;
  if (loadError) return <div className="admin-page compact-tables-page compact-admin-list-page admin-course-page"><h1 className="sr-only">Courses & classes</h1><ErrorState title="Could not load courses" message={loadError} onRetry={() => window.location.reload()} /></div>;

  return <div className={"admin-page compact-tables-page compact-admin-list-page admin-course-page" + (showCourseDetails ? " show-course-details" : "")}>
    <h1 className="sr-only">Courses & classes</h1>
    <div className="admin-course-filter-row">
      <Field label="SEARCH"><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search course or class..." /></Field>
      <div className="admin-course-options">
        <Field label="SEMESTER"><SelectMenu value={semester} onChange={(event) => { setSemester(event.target.value); setPage(1); }}><option>All semesters</option>{semesters.map((term) => <option key={term}>{term}</option>)}</SelectMenu></Field>
        <button className="button primary admin-button" onClick={() => { setCreateError(""); setDialog(true); }}>Add class</button>
      </div>
    </div>
    {loadError && <Notice>{loadError}</Notice>}{notice && <Notice>{notice}</Notice>}
    <Split
      main={pickingLecturer && selected ? (
        <div className="admin-lecturer-picker-pane">
          <div className="lecturer-picker-heading">
            <div>
              <h2>Assign a lecturer</h2>
              <p>{selected.id} · {selected.course}</p>
            </div>
            <button type="button" className="button admin-button" onClick={() => { setPickingLecturer(false); setLecturerQuery(""); }}>
              Cancel
            </button>
          </div>
          <SearchablePersonMenu
            label="Search lecturers"
            items={lecturers}
            query={lecturerQuery}
            onQueryChange={setLecturerQuery}
            onSelect={(person: PersonOption) => void assignLecturer(person.id, person.name)}
            searchPlaceholder="Search lecturer name or email..."
            emptyText={lecturers.length ? "No lecturers match this search." : "No active lecturers are available."}
            currentId={selected.lecturerId}
            actionLabel="Assign"
            busy={assigningLecturer}
            autoFocus
            footer={selected.lecturer !== "Unassigned" ? (
              <button
                type="button"
                className="lecturer-remove-link"
                disabled={assigningLecturer}
                onClick={() => void assignLecturer("Unassigned", "Unassigned")}
              >
                Remove current lecturer
              </button>
            ) : null}
          />
        </div>
      ) : (
        <>
          <div className="admin-table-wrap compact-table-scroll" role="region" aria-label="Courses and classes table" tabIndex={0}>
            <table className="admin-table admin-course-table">
              <thead>
                <tr>
                  <th>COURSE / CLASS</th>
                  <th>LECTURER</th>
                  <th>STUDENTS</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {pageClasses.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === selected?.id ? "is-selected" : ""}
                    onClick={() => { setSelectedId(item.id); setShowCourseDetails(true); }}
                  >
                    <td data-label="COURSE / CLASS">
                      <button className="admin-row-link" onClick={() => { setSelectedId(item.id); setShowCourseDetails(true); }}>{item.course}</button>
                      <small>{item.id}</small>
                    </td>
                    <td data-label="LECTURER" className={item.lecturer === "Unassigned" ? "admin-warning" : ""}>{item.lecturer}</td>
                    <td data-label="STUDENTS">{item.students}</td>
                    <td data-label="STATUS" className={item.status === "Active" ? "admin-success" : "admin-warning"}>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loadError && classes.length === 0 && <p className="admin-table-footer">No classes yet. Add a class to get started.</p>}
            {!loadError && classes.length > 0 && visible.length === 0 && <p className="admin-table-footer">No classes match these filters.</p>}
          </div>
          <AdminListPagination total={visible.length} page={currentPage} onPageChange={setPage} label="Course and class pages" noun="classes" alwaysVisible />
        </>
      )}
      side={selected ? <>
        <div className="admin-compact-panel-header">
          <h2>{selected.id}</h2>
          <button type="button" className="text-button compact-panel-back" onClick={() => { setShowCourseDetails(false); setPickingLecturer(false); }}>Back to classes</button>
        </div>
        <h3 className="admin-detail-title">{selected.course.split(" · ")[1] || selected.course}</h3>
        <p className={selected.status === "Active" ? "admin-success" : "admin-warning"}>
          {selected.status}{selected.lecturer === "Unassigned" ? " · Lecturer needed" : ""}
        </p>
        <div className="admin-detail-divider" />
        <Field label="SEMESTER">
          <SelectMenu value={selected.semester} onChange={async (event) => {
            const newSemester = event.target.value;
            try {
              const res = await adminService.updateClass(selected.id, { semester: newSemester });
              setClasses((all) => all.map((item) => item.id === selected.id ? res : item));
              setNotice(`${selected.id} semester updated.`);
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "Could not update semester.");
            }
          }}>
            {academicTerms(selected.semester).map((term) => (
              <option key={term} value={term}>{term}</option>
            ))}
          </SelectMenu>
        </Field>
        <Field label="CLASS DATES">
          <input readOnly value={formatClassDateRange(selected.startDate, selected.endDate)} />
        </Field>
        <LecturerSlot
          lecturer={findLecturer(lecturers, selected.lecturerId, selected.lecturer)}
          disabled={assigningLecturer || pickingLecturer}
          changeLabel={assigningLecturer ? "Saving…" : pickingLecturer ? "Choosing…" : "Change"}
          onChange={() => { setPickingLecturer(true); setShowCourseDetails(true); }}
        />
        <p className="admin-muted">{selected.students} enrolled student{selected.students === 1 ? "" : "s"}</p>
        <div className="admin-button-stack">
          <Link className="button admin-button" to={`/admin/courses/classes/${encodeURIComponent(selected.id)}/edit`}>Edit class</Link>
        </div>
      </> : <h2>Class details</h2>}
    />
    {dialog && <CourseDialog error={createError} busy={creating} onClose={() => setDialog(false)} onCreate={async (id, course, term) => {
      if (classes.some((item) => item.id.toLowerCase() === id.toLowerCase())) { setCreateError(`A class with ID ${id} already exists.`); return; }
      setCreating(true);
      setCreateError("");
      try {
        const item = await adminService.createClass({ id, course, semester: term, lecturerId: "Unassigned" });
        setClasses((all) => [...all, item]); setSelectedId(id); setQuery(""); setSemester("All semesters"); setPage(Math.floor(classes.length / pageSize) + 1); setDialog(false); setNotice(`${id} was added.`);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Could not create class.");
      } finally { setCreating(false); }
    }} />}
  </div>;
}

export function AdminEditClassPage() {
  const { classId: routeId = "" } = useParams();
  const classId = decodeURIComponent(routeId);
  const navigate = useNavigate();
  const [record, setRecord] = useState<AdminClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [course, setCourse] = useState("");
  const [semester, setSemester] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [lecturer, setLecturer] = useState("Unassigned");
  const [status, setStatus] = useState<AdminClass["status"]>("Draft");
  const [notice, setNotice] = useState("");
  const [lecturers, setLecturers] = useState<LecturerOption[]>([]);
  const [lecturerQuery, setLecturerQuery] = useState("");
  const [choosingLecturer, setChoosingLecturer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<TeacherClassMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  useEffect(() => {
    Promise.all([
      adminService.getClasses(),
      adminService.getLecturers()
    ]).then(([classList, lecturerList]) => {
      const cls = classList.find((item) => item.id === classId);
      if (cls) {
        setRecord(cls);
        setCourse(cls.course);
        setSemester(cls.semester);
        setStartDate(cls.startDate || "");
        setEndDate(cls.endDate || "");
        setLecturer(cls.lecturerId || "Unassigned");
        setStatus(cls.status as AdminClass["status"]);
      }
      setLecturers(lecturerList);
      setLoading(false);
    }).catch((error) => { setLoadError(error instanceof Error ? error.message : "Could not load class details."); setLoading(false); });
  }, [classId]);

  useEffect(() => {
    let active = true;
    setMembersLoading(true);
    setMembersError("");
    teacherService.getClassMembers(classId)
      .then((classMembers) => {
        if (!active) return;
        setMembers(classMembers);
      })
      .catch((error) => {
        if (active) setMembersError(error instanceof Error ? error.message : "Could not load class members.");
      })
      .finally(() => { if (active) setMembersLoading(false); });
    return () => { active = false; };
  }, [classId]);

  if (loading) return <div className="admin-page"><Loading label="Loading class details…" /></div>;
  if (loadError) return <div className="admin-page"><Notice>{loadError}</Notice></div>;
  if (!record) return <div className="admin-page"><p className="admin-muted">This class may have been removed.</p></div>;

  const currentRecord = record;

  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const filteredMembers = members.filter((member) =>
    `${member.name} ${member.id || ""} ${member.email || ""}`.toLowerCase().includes(normalizedMemberSearch),
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const dateError = classDateError(startDate, endDate);
    if (dateError) { setNotice(dateError); return; }
    setSaving(true);
    setNotice("");
    try {
      await adminService.updateClass(currentRecord.id, { course, semester, lecturerId: lecturer, status, startDate, endDate });
      navigate("/admin/courses", { state: { selectedId: currentRecord.id, notice: `${currentRecord.id} class details saved.` } });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save class details.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="admin-page">
    <div className="admin-edit-layout admin-class-edit-layout">
      <form className="admin-edit-form admin-class-form" onSubmit={save}>
        <h2>{currentRecord.id} · Class details</h2>
        <Field label="CLASS ID"><input value={currentRecord.id} readOnly /><small className="admin-muted">Class IDs stay fixed so existing student work keeps its link.</small></Field>
        <Field label="COURSE"><input value={course} onChange={(event) => setCourse(event.target.value)} /></Field>
        <Field label="SEMESTER"><SelectMenu value={semester} onChange={(event) => setSemester(event.target.value)}>
          {academicTerms(semester).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </SelectMenu></Field>
        <LecturerSlot
          lecturer={findLecturer(lecturers, lecturer, lecturer === currentRecord.lecturerId ? currentRecord.lecturer : undefined)}
          changeLabel={choosingLecturer ? "Close" : "Change"}
          onChange={() => { setChoosingLecturer((open) => !open); setLecturerQuery(""); }}
        />
        {choosingLecturer && <div className="lecturer-inline-picker">
          <SearchablePersonMenu
            label="Search lecturers"
            items={lecturers}
            query={lecturerQuery}
            onQueryChange={setLecturerQuery}
            onSelect={(person) => { setLecturer(person.id); setLecturerQuery(""); setChoosingLecturer(false); }}
            searchPlaceholder="Search lecturer name or email..."
            emptyText={lecturers.length ? "No lecturers match this search." : "No active lecturers are available."}
            currentId={lecturer}
            actionLabel="Choose"
            autoFocus
            footer={lecturer !== "Unassigned" ? (
              <button type="button" className="lecturer-remove-link" onClick={() => { setLecturer("Unassigned"); setChoosingLecturer(false); }}>Remove lecturer</button>
            ) : null}
          />
        </div>}
        <Field label="CLASS STATUS"><SelectMenu value={status} onChange={(event) => setStatus(event.target.value as AdminClass["status"])}><option>Draft</option><option>Active</option><option>Archived</option></SelectMenu></Field>
        {notice && <Notice>{notice}</Notice>}
        <div className="admin-class-form-bottom">
          <div>
            <div className="admin-class-date-row">
              <Field label="START DATE"><input type="date" min={CLASS_DATE_MIN} max={CLASS_DATE_MAX} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
              <Field label="END DATE"><input type="date" min={CLASS_DATE_MIN} max={CLASS_DATE_MAX} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>
            </div>
          </div>
          <div className="admin-edit-actions admin-class-inline-actions"><Link className="button admin-button" to="/admin/courses">Cancel</Link><button className="button primary admin-button" disabled={saving}>{saving ? "Saving…" : "Save class"}</button></div>
        </div>
      </form>
      <aside className="admin-edit-form admin-edit-members" aria-labelledby="admin-class-members-title">
        <div className="admin-members-heading">
          <div>
            <h2 id="admin-class-members-title">Class members</h2>
            <p className="admin-muted">Read-only. The assigned lecturer manages enrollment.</p>
          </div>
          <span className="class-roster-count">{members.length}</span>
        </div>
        {membersError && <Notice>{membersError}</Notice>}
        {membersLoading ? <Loading label="Loading class members…" /> : <>
          {members.length > 5 && <label className="person-search">
            <span className="sr-only">Filter students</span>
            <Search size={15} aria-hidden="true" />
            <input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Filter by name or email..." />
          </label>}
          <section className="admin-member-list">
            {filteredMembers.map((member) => (
              <div className="admin-member-row" key={member.id || member.email}>
                <PersonIdentity name={member.name} id={member.id} email={member.email} />
              </div>
            ))}
            {!filteredMembers.length && (
              <p className="admin-member-empty">{members.length ? "No enrolled students match this search." : "No students are enrolled yet."}</p>
            )}
          </section>
        </>}
      </aside>
    </div>
  </div>;
}

export function AdminLecturersPage() {
  const location = useLocation();
  const state = location.state as { selectedId?: string } | null;
  const initialSelectedId = state?.selectedId || "";

  const [assignments, setAssignments] = useState<AdminClass[]>([]);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [lecturer, setLecturer] = useState("Unassigned");
  const [notice, setNotice] = useState("");
  const [lecturers, setLecturers] = useState<{ name: string, id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      adminService.getClasses(),
      adminService.getUsers()
    ]).then(([classes, users]) => {
      const sorted = [...classes].sort((a, b) => Number(b.lecturer === "Unassigned") - Number(a.lecturer === "Unassigned"));
      setAssignments(sorted);
      if (sorted.length > 0 && !selectedId) {
        setSelectedId(sorted[0].id);
        setLecturer(sorted[0].lecturerId || "Unassigned");
      } else if (selectedId) {
        const cls = sorted.find(c => c.id === selectedId);
        if (cls) setLecturer(cls.lecturerId || "Unassigned");
      }
      setLecturers(users.filter((user: any) => user.role.toLowerCase() === "lecturer" || user.role === "instructor").map((user: any) => ({ name: user.name, id: user.id })));
    }).catch((error) => setLoadError(error instanceof Error ? error.message : "Could not load classes and lecturers.")).finally(() => setLoading(false));
  }, []);

  const selected = assignments.find((item) => item.id === selectedId);

  return <div className="admin-page">
    <PageIntro title="Lecturer assignment" sub={`Class ownership / ${selected?.semester || ""}`}>
      <button className="button primary admin-button" disabled={!selected || saving || lecturer === (selected.lecturerId || "Unassigned")} onClick={async () => {
        if (!selected) return;
        setSaving(true);
        setNotice("");
        try {
          const updated = await adminService.updateClass(selectedId, { lecturerId: lecturer === "Unassigned" ? "Unassigned" : lecturer });
          setAssignments((all) => all.map((item) => item.id === selectedId ? updated : item));
          setNotice(`${updated.lecturer} assigned to ${selectedId}.`);
        } catch (err) {
          setNotice(err instanceof Error ? err.message : "Could not assign lecturer.");
        } finally {
          setSaving(false);
        }
      }}>{saving ? "Saving…" : "Save assignment"}</button>
    </PageIntro>{notice && <Notice>{notice}</Notice>}
    {loading ? <Loading label="Loading classes and lecturers…" /> : loadError ? <p className="admin-notice" role="alert">{loadError}</p> : assignments.length === 0 ? <p className="admin-muted">No classes are available for lecturer assignment.</p> :
      <Split main={<div className="admin-table-wrap sticky-list-table-wrap"><table className="admin-table sticky-list-table admin-lecturer-table"><thead><tr><th>CLASS</th><th>CURRENT LECTURER</th><th>STATUS</th></tr></thead><tbody>{assignments.map((item) => <tr key={item.id} className={item.id === selectedId ? "is-selected" : ""} onClick={() => { setSelectedId(item.id); setLecturer(item.lecturerId || "Unassigned"); }}><td data-label="CLASS"><b>{item.id}</b></td><td data-label="CURRENT LECTURER" className={item.lecturer === "Unassigned" ? "admin-warning" : ""}>{item.lecturer}</td><td data-label="STATUS">{item.lecturer === "Unassigned" ? "Needs lecturer" : "Assigned"}</td></tr>)}</tbody></table></div>} side={selected ? <>
        <h2>Assign {selected.id}</h2><p className="admin-muted">{selected.course.split(" · ")[1] || selected.course} · {selected.semester} · {selected.students} student{selected.students === 1 ? "" : "s"}</p><Field label="LECTURER"><SelectMenu value={lecturer} onChange={(e) => setLecturer(e.target.value)}><option value="Unassigned">Unassigned</option>{lecturers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectMenu></Field><div className="admin-detail-divider" /><h3 className="admin-subheading">Access preview</h3><p className="admin-muted">The selected lecturer can manage assignments, view class results and review submissions after assignment is saved.</p>
      </> : <h2>No class selected</h2>} />}
  </div>;
}

type CatalogProblem = AdminPracticeProblem & { id: string };
function PracticePreviewDialog({ problem, onClose }: { problem: CatalogProblem; onClose: () => void }) {
  const reviewSignal = problem.attempted ? problem.acceptance < 45
    ? "Low solve rate · consider adding a hint"
    : problem.acceptance > 80
      ? "High solve rate · suitable for an introductory set"
      : "Balanced solve rate" : "Activity statistics unavailable";
  return <Dialog title="Student practice preview" onClose={onClose} className="admin-practice-preview">
    <div className="admin-preview-heading"><h3>{problem.title}</h3><p>{problem.difficulty} · {problem.topics} · {problem.database}</p></div>
    <section className="admin-preview-section"><h4>Problem</h4><p>{problem.description}</p>{problem.expectedColumns && <p className="admin-muted">Return columns: <code>{problem.expectedColumns}</code></p>}</section>
    <section className="admin-preview-section"><h4>Available tables</h4><pre>{problem.schemaPreview}</pre></section>
    <section className="admin-preview-insight"><b>Practice signal</b><span>{reviewSignal}</span>{problem.attempted > 0 && <small>{problem.attempted} attempts · {problem.acceptance}% accepted</small>}</section>
    <div className="admin-dialog-actions"><button type="button" className="button primary admin-button" onClick={onClose}>Done</button></div>
  </Dialog>;
}

export function AdminPracticeCatalogPage() {
  const [problems, setProblems] = useState<CatalogProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [showPracticeDetails, setShowPracticeDetails] = useState(false);
  const [topic, setTopic] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [difficulty, setDifficulty] = useState("All levels");
  const [visibility, setVisibility] = useState("All");
  const [notice, setNotice] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [previewing, setPreviewing] = useState<CatalogProblem | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    studentApi.getProblems().then(data => {
      const mapped: CatalogProblem[] = data.map((p: any) => ({
        id: p.id,
        title: p.title,
        topics: p.topics ? p.topics.join(" · ") : (p.topic || ""),
        difficulty: p.difficulty,
        solvedBy: p.solvedBy || 0,
        status: p.practiceListed ? "Visible" : "Hidden",
        author: "—",
        published: p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—",
        database: p.databaseType || "SQL Server",
        attempted: p.attempted || 0,
        acceptance: p.acceptance || 0,
        submissions: p.submissions || 0,
        comments: false,
        hints: false,
        note: "",
        featured: false,
        description: "",
        schemaPreview: "",
        expectedColumns: ""
      }));
      setProblems(mapped);
      if (mapped.length > 0) {
        setSelectedId(mapped[0].id);
      }
      setLoading(false);
    }).catch(err => {
      setCatalogError(err instanceof Error ? err.message : "Could not load the Practice catalog.");
      setLoading(false);
    });
  }, []);

  async function openPreview(problem: CatalogProblem) {
    setPreviewBusy(true);
    setNotice("");
    try {
      const detail = await studentApi.getProblem(problem.id);
      setPreviewing({ ...problem, description: detail.description || "", schemaPreview: detail.schema || "" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load problem preview.");
    } finally {
      setPreviewBusy(false);
    }
  }

  const list = useMemo(() => problems.filter((problem) =>
    problem.title.toLowerCase().includes(query.toLowerCase()) &&
    (difficulty === "All levels" || problem.difficulty === difficulty) &&
    (visibility === "All" || problem.status === visibility) &&
    (!topic || problem.topics.split(" · ").some(name => name.trim() === topic))), [problems, query, difficulty, visibility, topic]);

  const computedTopics = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of problems) {
      if (!p.topics) continue;
      const parts = p.topics.split(" · ");
      for (const t of parts) {
        if (!t.trim()) continue;
        counts[t.trim()] = (counts[t.trim()] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, problems: count }))
      .sort((a, b) => b.problems - a.problems);
  }, [problems]);

  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageProblems = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = pageProblems.find(problem => problem.id === selectedId) || pageProblems[0];
  useEffect(() => { setPage(current => Math.min(current, pageCount)); }, [pageCount]);

  if (loading) {
    return <div className="admin-page compact-tables-page compact-admin-list-page admin-practice-page"><h1 className="sr-only">Practice catalog</h1><Loading label="Loading catalog…" /></div>;
  }
  if (catalogError) return <div className="admin-page compact-tables-page compact-admin-list-page admin-practice-page"><h1 className="sr-only">Practice catalog</h1><ErrorState title="Could not load catalog" message={catalogError} onRetry={() => window.location.reload()} /></div>;

  return <div className={"admin-page compact-tables-page compact-admin-list-page admin-practice-page" + (showPracticeDetails ? " show-practice-details" : "")}>
    <h1 className="sr-only">Practice catalog</h1>
    {notice && <Notice>{notice}</Notice>}
    <div className="admin-practice-filters admin-practice-topic-filters">
      <div className="admin-practice-main-filters">
        <Field label="SEARCH"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search title..." /></Field>
        <Field label="TOPIC"><SelectMenu value={topic} onChange={event => { setTopic(event.target.value); setPage(1); }}><option value="">All topics</option>{computedTopics.map(item => <option key={item.name} value={item.name}>{item.name} ({item.problems})</option>)}</SelectMenu></Field>
        <Field label="DIFFICULTY"><SelectMenu value={difficulty} onChange={(event) => { setDifficulty(event.target.value); setPage(1); }}><option>All levels</option><option>Easy</option><option>Medium</option><option>Hard</option></SelectMenu></Field>
      </div>
      <Field label="VISIBILITY"><SelectMenu value={visibility} onChange={(event) => { setVisibility(event.target.value); setPage(1); }}><option>All</option><option>Visible</option><option>Hidden</option></SelectMenu></Field>
    </div>
    <Split className="admin-practice-split" main={<><div className="admin-table-wrap compact-table-scroll" role="region" aria-label="Practice problems table" tabIndex={0}><table className="admin-table admin-practice-table"><thead><tr><th>PROBLEM</th><th>TOPICS</th><th>DIFFICULTY</th><th>SOLVED BY</th><th>STATUS</th></tr></thead><tbody>
      {pageProblems.map((problem) => <tr key={problem.id} className={problem.id === selected?.id ? "is-selected" : ""} onClick={() => { setSelectedId(problem.id); setShowPracticeDetails(true); }}>
        <td data-label="PROBLEM"><button className="admin-row-link" type="button" onClick={() => { setSelectedId(problem.id); setShowPracticeDetails(true); }}>{problem.title}</button></td><td data-label="TOPICS">{problem.topics}</td><td data-label="DIFFICULTY">{problem.difficulty}</td><td data-label="SOLVED BY">{problem.solvedBy}</td><td data-label="STATUS" className={problem.status === "Visible" ? "admin-success" : ""}>{problem.status}</td>
      </tr>)}
      {!list.length && <tr><td colSpan={5} className="admin-muted">No practice problems match these filters.</td></tr>}
    </tbody></table></div><AdminListPagination total={list.length} page={currentPage} onPageChange={setPage} label="Practice problem pages" noun="problems" alwaysVisible /></>} side={selected ? <>
      <div className="admin-compact-panel-header"><h2>{selected.title}</h2><button type="button" className="text-button compact-panel-back" onClick={() => setShowPracticeDetails(false)}>Back to problems</button></div>
      {selected.published !== "—" && <p className="admin-muted">Updated {selected.published}</p>}
      <p className="admin-accent">{selected.difficulty} · {selected.database}</p>
      {selected.topics && <p className="admin-muted">{selected.topics}</p>}
      <div className="admin-detail-divider" />
      <dl className="teacher-list-detail-facts">
        <div><dt>Visibility</dt><dd>{selected.status}</dd></div>
        <div><dt>Attempts</dt><dd>{selected.attempted}</dd></div>
        <div><dt>Acceptance</dt><dd>{selected.attempted ? selected.acceptance + "%" : "—"}</dd></div>
        <div><dt>Submissions</dt><dd>{selected.submissions}</dd></div>
      </dl>
      <div className="admin-practice-actions"><button className="button admin-button" type="button" disabled={previewBusy} onClick={() => void openPreview(selected)}>{previewBusy ? "Loading…" : "View details"}</button></div>
    </> : <p className="admin-muted">Select a problem.</p>} />
    {previewing && <PracticePreviewDialog problem={previewing} onClose={() => setPreviewing(null)} />}
  </div>;
}

function OverviewPagination({ total, page, onPageChange, label }: { total: number; page: number; onPageChange: (page: number) => void; label: string }) {
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  return <nav className="admin-table-pagination" aria-label={label}>
    <button type="button" className="button admin-button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>← Previous</button>
    <span>Page {currentPage} of {pageCount}</span>
    <button type="button" className="button admin-button" disabled={currentPage === pageCount} onClick={() => onPageChange(currentPage + 1)}>Next →</button>
  </nav>;
}

function OverviewActivityPanel({ activity, onClose }: { activity: any; onClose: () => void }) {
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const classId = /^(?:Created|Updated) class (.+)$/.exec(activity.action)?.[1];
  const relatedClass = classes.find(item => item.id === classId);
  const namedActors = users.filter(user => user.name === activity.by);
  const actor = namedActors.length === 1 ? namedActors[0] : undefined;

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([adminService.getClasses(), adminService.getUsers()]).then(([classResult, userResult]) => {
      if (cancelled) return;
      if (classResult.status === "fulfilled") setClasses(classResult.value);
      if (userResult.status === "fulfilled") setUsers(userResult.value);
      if (classResult.status === "rejected" || userResult.status === "rejected") setError("Some related information could not be loaded.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return <div className="admin-overview-details">
    <div className="admin-overview-panel-header"><h2>Activity details</h2><button type="button" className="text-button" onClick={onClose}>Close</button></div>
    <h3 className="admin-detail-title">{activity.action}</h3>
    <dl className="teacher-list-detail-facts">
      <div><dt>Performed by</dt><dd>{activity.by || "System"}</dd></div>
      <div><dt>Time</dt><dd>{activity.time ? parseServerDateTime(activity.time).toLocaleString() : "Unknown"}</dd></div>
    </dl>
    {loading ? <Loading label="Loading related information…" /> : <>
      {error && <p className="admin-warning" role="alert">{error}</p>}
      {classId && <>
        <div className="admin-detail-divider" />
        <h3 className="admin-subheading">Current class information</h3>
        {relatedClass ? <dl className="teacher-list-detail-facts">
          <div><dt>Class code</dt><dd><Link className="title-link" to={`/admin/courses/classes/${encodeURIComponent(relatedClass.id)}/edit`}>{relatedClass.id}</Link></dd></div>
          <div><dt>Course</dt><dd>{relatedClass.course}</dd></div>
          <div><dt>Semester</dt><dd>{relatedClass.semester || "—"}</dd></div>
          <div><dt>Lecturer</dt><dd>{relatedClass.lecturer}</dd></div>
          <div><dt>Students</dt><dd>{relatedClass.students}</dd></div>
          <div><dt>Status</dt><dd>{relatedClass.status}</dd></div>
          <div><dt>Dates</dt><dd>{formatClassDateRange(relatedClass.startDate, relatedClass.endDate)}</dd></div>
        </dl> : <p className="admin-muted">Class {classId}: current information is unavailable.</p>}
        <p className="admin-muted admin-overview-context-note">Class information reflects its current state. This activity record does not contain the previous field values.</p>
      </>}
      {actor && <>
        <div className="admin-detail-divider" /><h3 className="admin-subheading">Current account information</h3>
        <dl className="teacher-list-detail-facts"><div><dt>Email</dt><dd>{actor.email}</dd></div><div><dt>Role</dt><dd>{actor.role}</dd></div><div><dt>Status</dt><dd>{actor.status}</dd></div><div><dt>Joined</dt><dd>{actor.joined}</dd></div></dl>
      </>}
    </>}
    <details className="admin-overview-record-reference"><summary>Record reference</summary><p className="admin-muted">{activity.id}</p></details>
  </div>;
}

function OverviewUnassignedClassesPanel({ onClose }: { onClose: () => void }) {
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selected = classes.find(item => item.id === selectedId) || classes[0];

  async function loadClasses() {
    setLoading(true);
    setError("");
    try {
      const data = await adminService.getClasses();
      const unassigned = data.filter(item => item.status !== "Archived" && item.lecturer === "Unassigned");
      setClasses(unassigned);
      setSelectedId(unassigned[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load classes.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void loadClasses(); }, []);

  return <div className="admin-overview-details">
    <div className="admin-overview-panel-header"><h2>Classes without a lecturer</h2><button type="button" className="text-button" onClick={onClose}>Close</button></div>
    {loading ? <Loading label="Loading classes…" /> : error ? <><p className="admin-warning" role="alert">{error}</p><button type="button" className="button admin-button" onClick={() => void loadClasses()}>Retry</button></> : selected ? <>
      <Field label={"UNASSIGNED CLASSES (" + classes.length + ")"}><SelectMenu value={selected.id} onChange={event => setSelectedId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{item.id} · {item.course}</option>)}</SelectMenu></Field>
      <div className="admin-detail-divider" />
      <h3 className="admin-detail-title"><Link className="title-link" to={`/admin/courses/classes/${encodeURIComponent(selected.id)}/edit`}>{selected.id}</Link></h3>
      <dl className="teacher-list-detail-facts">
        <div><dt>Course</dt><dd>{selected.course}</dd></div>
        <div><dt>Semester</dt><dd>{selected.semester || "—"}</dd></div>
        <div><dt>Status</dt><dd>{selected.status}</dd></div>
        <div><dt>Lecturer</dt><dd className="admin-warning">Unassigned</dd></div>
        <div><dt>Students</dt><dd>{selected.students}</dd></div>
        <div><dt>Dates</dt><dd>{formatClassDateRange(selected.startDate, selected.endDate)}</dd></div>
      </dl>
    </> : <p className="admin-muted">All classes have an assigned lecturer.</p>}
  </div>;
}

export function AdminOverviewPage() {
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState({ users: 0, classes: 0, pendingRequests: 0, unassignedClasses: 0, submissionsToday: 0, gradingErrors: 0 });
  const [activities, setActivities] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [attentionPage, setAttentionPage] = useState(1);
  const [selection, setSelection] = useState<{ type: "attention" | "activity"; id: string } | null>(null);
  const selectedActivity = selection?.type === "activity" ? activities.find(item => item.id === selection.id) : undefined;
  const [activityPage, setActivityPage] = useState(1);
  const pageSize = 10;
  const attentionItems = [
    { id: "unassigned", title: "Classes without a lecturer", count: stats.unassignedClasses, unit: "class(es)" },
  ];
  const currentAttentionPage = Math.min(attentionPage, Math.max(1, Math.ceil(attentionItems.length / pageSize)));
  const currentActivityPage = Math.min(activityPage, Math.max(1, Math.ceil(activities.length / pageSize)));
  const visibleAttention = attentionItems.slice((currentAttentionPage - 1) * pageSize, currentAttentionPage * pageSize);
  const visibleActivities = activities.slice((currentActivityPage - 1) * pageSize, currentActivityPage * pageSize);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminService.getOverviewStats(),
      adminService.getActivities(),
      adminService.getErrors()
    ]).then(([statsData, activitiesData, errorsData]) => {
      setStats({
        users: statsData.users,
        classes: statsData.classes,
        pendingRequests: statsData.pendingRequests,
        unassignedClasses: statsData.unassignedClasses,
        submissionsToday: statsData.submissionsToday,
        gradingErrors: statsData.gradingErrors
      });
      setActivities(activitiesData);
      setErrors(errorsData);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setNotice("Failed to load overview data.");
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className={"admin-page compact-tables-page admin-overview-page" + (selection ? " has-overview-selection" : "")}><h1 className="sr-only">System overview</h1><Loading label="Loading overview…" /></div>;
  }
  if (notice) return <div className={"admin-page compact-tables-page admin-overview-page" + (selection ? " has-overview-selection" : "")}><h1 className="sr-only">System overview</h1><p className="admin-notice" role="alert">{notice}</p></div>;

  return <div className={"admin-page compact-tables-page admin-overview-page" + (selection ? " has-overview-selection" : "")}>
    <h1 className="sr-only">System overview</h1>
    <Split className="admin-overview-split" main={<>
      <section className="admin-attention">
        <div className="admin-overview-table-heading">
          <h2 className="admin-section-heading">Needs attention</h2>
          <div className="admin-overview-table-controls">
            <span className="admin-muted" role="status">Showing {attentionItems.length === 0 ? 0 : (currentAttentionPage - 1) * pageSize + 1}–{Math.min(currentAttentionPage * pageSize, attentionItems.length)} of {attentionItems.length.toLocaleString()} items</span>
            <OverviewPagination total={attentionItems.length} page={currentAttentionPage} onPageChange={setAttentionPage} label="Needs attention pages" />
          </div>
        </div>
        <div className="compact-table-scroll" role="region" aria-label="Needs attention table" tabIndex={0}>
          <table className="admin-table admin-attention-table"><thead><tr><th>ITEM</th><th>COUNT</th></tr></thead><tbody>
            {visibleAttention.map(item => {
              const isSelected = selection?.type === "attention" && selection.id === item.id;
              const selectRow = () => setSelection({ type: "attention", id: item.id });
              return <tr key={item.id} className={isSelected ? "is-selected" : ""} onClick={selectRow}>
                <td data-label="ITEM"><button type="button" className="admin-overview-row-button" aria-pressed={isSelected} onClick={selectRow}>{item.title}</button></td>
                <td data-label="COUNT" className={item.count > 0 ? "admin-warning" : ""}>{item.count} {item.unit}</td>
              </tr>;
            })}
          </tbody></table>
        </div>
      </section>
      <section className="admin-recent-activity">
        <div className="admin-overview-table-heading">
          <h2 className="admin-section-heading">Recent activity</h2>
          <div className="admin-overview-table-controls">
            <span className="admin-muted" role="status">Showing {activities.length === 0 ? 0 : (currentActivityPage - 1) * pageSize + 1}–{Math.min(currentActivityPage * pageSize, activities.length)} of {activities.length.toLocaleString()} items</span>
            <OverviewPagination total={activities.length} page={currentActivityPage} onPageChange={setActivityPage} label="Recent activity pages" />
          </div>
        </div>
        <div className="compact-table-scroll" role="region" aria-label="Recent activity table" tabIndex={0}>
          <table className="admin-table admin-activity-table"><thead><tr><th>ACTION</th><th>BY</th><th>TIME</th></tr></thead><tbody>
            {activities.length > 0 ? visibleActivities.map(item => {
              const isSelected = selection?.type === "activity" && selection.id === item.id;
              const selectRow = () => setSelection({ type: "activity", id: item.id });
              return <tr key={item.id} className={isSelected ? "is-selected" : ""} onClick={selectRow}>
                <td><button type="button" className="admin-overview-row-button" aria-pressed={isSelected} onClick={selectRow}>{item.action}</button></td><td>{item.by}</td><td>{item.time ? localTime(item.time) : "Unknown"}</td>
              </tr>;
            }) : <tr><td colSpan={3} className="admin-muted">No recent activity</td></tr>}
          </tbody></table>
        </div>
      </section>
    </>} side={selection?.type === "attention" && selection.id === "unassigned" ? <OverviewUnassignedClassesPanel onClose={() => setSelection(null)} /> : selectedActivity ? <OverviewActivityPanel key={selectedActivity.id} activity={selectedActivity} onClose={() => setSelection(null)} /> : <>
      <h2>Grading health</h2><p className={stats.gradingErrors === 0 ? "admin-health" : "admin-health admin-warning"}>{stats.gradingErrors === 0 ? "Operational" : "Needs Attention"}</p><p className="admin-muted">{stats.submissionsToday} submitted today / {stats.gradingErrors} need attention</p><div className="admin-detail-divider" /><h3 className="admin-subheading">Recent errors</h3>
      {errors.length > 0 ? errors.map(err => <p key={err.id} className="admin-warning admin-error">#{err.id.substring(0, 8)} · {err.errorType}<br />{err.problemTitle}</p>) : <p className="admin-muted">No errors recently</p>}
    </>} />
  </div>;
}


export const AdminClassesPage = AdminCoursesPage;


