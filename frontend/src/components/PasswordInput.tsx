import { useState, type InputHTMLAttributes } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { passwordRequirements, type PasswordRequirement } from "../utils/passwordRequirements";

export function PasswordInput({ label, disabled, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-input">
    <input {...props} disabled={disabled} type={visible ? "text" : "password"} />
    <button type="button" className="password-visibility" disabled={disabled}
      onClick={() => setVisible((current) => !current)}
      aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} title={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}>
      {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
    </button>
  </span>;
}

export function PasswordChecklist({ id, password, policy, confirm }: { id: string; password: string; policy: "self" | "admin"; confirm?: string }) {
  const requirements: PasswordRequirement[] = passwordRequirements(password, policy);
  if (confirm !== undefined) requirements.push({ key: "match", label: "Passwords match", met: !!password && password === confirm });
  return <ul id={id} className="password-checklist" aria-label="Password requirements">
    {requirements.map((requirement) => <li key={requirement.key} className={requirement.met ? "is-met" : ""}>
      {requirement.met ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
      <span>{requirement.label}<span className="sr-only">{requirement.met ? ": met" : ": not yet met"}</span></span>
    </li>)}
  </ul>;
}
