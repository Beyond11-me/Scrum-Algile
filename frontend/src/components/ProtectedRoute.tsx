import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { session } = useAuth();
  const location = useLocation();
  if (session?.role === "admin") {
    return <Navigate to="/admin/classes" replace />;
  }
  if (session?.role === "instructor") {
    return <Navigate to="/teacher/problems" replace />;
  }
  return session ? (
    <Outlet />
  ) : (
    <Navigate
      to="/login"
      replace
      state={{ from: location.pathname + location.search + location.hash }}
    />
  );
}

export function PublicOnlyRoute() {
  const session = useAuth().session;
  return session ? (
    <Navigate
      to={
        session.role === "admin"
          ? "/admin/classes"
          : session.role === "instructor"
            ? "/teacher/problems"
            : "/assignments"
      }
      replace
    />
  ) : (
    <Outlet />
  );
}

export function TeacherRoute() {
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
  return session.role === "instructor" ? (
    <Outlet />
  ) : (
    <Navigate to={session.role === "admin" ? "/admin/classes" : "/assignments"} replace />
  );
}

export function AdminRoute() {
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
  return session.role === "admin" ? (
    <Outlet />
  ) : (
    <Navigate to={session.role === "instructor" ? "/teacher/problems" : "/assignments"} replace />
  );
}
