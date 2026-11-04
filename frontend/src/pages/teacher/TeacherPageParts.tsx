import type { ReactNode } from "react";

export function TeacherPageIntro({
  title,
  context,
  children,
  compact = false,
}: {
  title: string;
  context: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`teacher-page-intro${compact ? " page-list-intro" : ""}`}>
      <div>
        <h1 className={compact ? "sr-only" : undefined}>{title}</h1>
        {context && <p>{context}</p>}
      </div>
      {children && <div className="teacher-page-actions">{children}</div>}
    </div>
  );
}

export function TeacherSectionTitle({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="teacher-section-title">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function TeacherField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`teacher-field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
