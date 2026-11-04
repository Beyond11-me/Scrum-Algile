import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasRole, homeForRole, type AppRole } from "../auth/roles";
import { useAuth } from "../context/AuthContext";

type RouteGuardProps = {
  allowedRoles?: readonly AppRole[];
};

/** Redirect unauthenticated or unauthorized users before rendering a route. */
export function RouteGuard({ allowedRoles }: RouteGuardProps) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    );
  }
  if (allowedRoles && !hasRole(session.role, allowedRoles)) {
    return <Navigate to={homeForRole(session.role)} replace />;
  }
  return <Outlet />;
}

export function ProtectedRoute({ allowedRoles }: RouteGuardProps) {
  return <RouteGuard allowedRoles={allowedRoles} />;
}

export function PublicOnlyRoute() {
  const session = useAuth().session;
  return session ? (
    <Navigate
      to={homeForRole(session.role)}
      replace
    />
  ) : (
    <Outlet />
  );
}

export function TeacherRoute() {
  return <RouteGuard allowedRoles={["instructor"]} />;
}

export function AdminRoute() {
  return <RouteGuard allowedRoles={["admin"]} />;
}
