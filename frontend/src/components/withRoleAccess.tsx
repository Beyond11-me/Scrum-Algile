import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";

import type { AppRole } from "../auth/roles";
import { hasRole } from "../auth/roles";
import { useAuth } from "../context/AuthContext";

/**
 * Hide a component when the signed-in account does not have an allowed role.
 * This is a UI guard only; the backend remains the authority for API access.
 */
export function withRoleAccess<P extends object>(
  Component: ComponentType<P>,
  allowedRoles: readonly AppRole[],
  fallback: ReactNode = null,
) {
  function RoleRestrictedComponent(props: P) {
    const { session } = useAuth();
    return hasRole(session?.role, allowedRoles) ? <Component {...props} /> : <>{fallback}</>;
  }

  RoleRestrictedComponent.displayName = `withRoleAccess(${Component.displayName || Component.name || "Component"})`;
  return RoleRestrictedComponent;
}

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

function ActionButton(props: ActionButtonProps) {
  return <button {...props} />;
}

// Reusable guards for role-specific actions. They deliberately render nothing
// for a disallowed role instead of exposing a non-functional control.
export const InstructorOnlyButton = withRoleAccess(ActionButton, ["instructor"]);
export const AdminOnlyButton = withRoleAccess(ActionButton, ["admin"]);
