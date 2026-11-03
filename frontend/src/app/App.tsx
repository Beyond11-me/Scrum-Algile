import { lazy, Suspense, useEffect } from "react";
import { APP_NAME } from "../data/models";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AppHeader } from "../components/AppHeader";
import { TeacherHeader } from "../components/TeacherHeader";
import { AdminHeader } from "../components/AdminHeader";
import {
  AdminRoute,
  ProtectedRoute,
  PublicOnlyRoute,
  TeacherRoute,
} from "../components/ProtectedRoute";
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  RegisterLecturerPage,
  ResetPasswordPage,
  VerifyOtpPage,
} from "../pages/auth/AuthPages";
import { AssignmentsPage } from "../pages/student/AssignmentsPage";
import { AssignmentWorkPage } from "../pages/student/AssignmentWorkPage";
import { AssignmentDetailPage } from "../pages/student/AssignmentDetailPage";
import { SubmissionsPage } from "../pages/student/SubmissionsPage";
import { ProblemListPage } from "../pages/student/ProblemListPage";
import { Loading } from "../components/ui";
import { ProblemEditorPage } from "../pages/teacher/ProblemEditorPage";
import { ProblemLibraryPage, AssignmentsListPage } from "../pages/teacher/TeacherLandingPages";
import { AssignmentBuilderPage } from "../pages/teacher/BuilderPages";
import { ClassesPage } from "../pages/teacher/ClassesPage";
import { ManualReviewPage, ResultsDashboardPage } from "../pages/teacher/ResultsPages";
import {
  AdminUsersPage,
  AdminEditAccountPage,
  AdminLecturerApprovalsPage,
  AdminRolesPage,
  AdminCoursesPage,
  AdminEditClassPage,
  AdminLecturersPage,
  AdminOverviewPage,
} from "../pages/admin/AdminClassesPage";

const WorkspacePage = lazy(() =>
  import("../pages/student/WorkspacePage").then((module) => ({
    default: module.WorkspacePage,
  })),
);

function Shell() {
  return (
    <>
      <AppHeader />
      <main id="main-content" className="student-main">
        <RouteContent />
      </main>
    </>
  );
}

function TeacherShell() {
  return (
    <>
      <TeacherHeader />
      <main id="main-content" className="teacher-main">
        <RouteContent />
      </main>
    </>
  );
}

function AdminShell() {
  return (
    <>
      <AdminHeader />
      <main id="main-content" className="admin-main">
        <RouteContent />
      </main>
    </>
  );
}

function RouteContent() {
  const { pathname } = useLocation();
  return (
    <div className="route-content" key={pathname}>
      <Outlet />
    </div>
  );
}

export function App() {
  useEffect(() => {
    document.title = APP_NAME;
  }, []);
  const { session } = useAuth();
  const home =
    session?.role === "admin"
      ? "/admin/users"
      : session?.role === "instructor"
      ? "/teacher/problems"
      : "/assignments";

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Routes>
        <Route
          path="/"
          element={<Navigate replace to={session ? home : "/login"} />}
        />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/register-lecturer" element={<RegisterLecturerPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-otp" element={<VerifyOtpPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<Shell />}>
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route
              path="/assignments/work/:assignmentId"
              element={<AssignmentWorkPage />}
            />
            <Route
              path="/assignments/classes/:scopeId"
              element={<AssignmentDetailPage />}
            />
            <Route path="/problems" element={<ProblemListPage />} />
            <Route path="/submissions" element={<SubmissionsPage />} />
            <Route path="/practice" element={<Navigate replace to="/problems" />} />
            <Route path="/dashboard" element={<Navigate replace to="/assignments" />} />
            <Route path="/contests" element={<Navigate replace to="/assignments" />} />
          </Route>
          <Route
            path="/workspace/:problemId"
            element={
              <Suspense fallback={<Loading />}>
                <WorkspacePage />
              </Suspense>
            }
          />
        </Route>
        <Route element={<TeacherRoute />}>
          <Route path="/teacher" element={<TeacherShell />}>
            <Route index element={<Navigate replace to="problems" />} />
            <Route path="problems" element={<ProblemLibraryPage />} />
            <Route path="problems/new" element={<ProblemEditorPage />} />
            <Route path="problems/:problemId/edit" element={<ProblemEditorPage />} />
            <Route path="assignments" element={<AssignmentsListPage />} />
            <Route path="assignments/new" element={<AssignmentBuilderPage />} />
            <Route path="assignments/:id/edit" element={<AssignmentBuilderPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="results" element={<ResultsDashboardPage />} />
            <Route path="results/review/:submissionId" element={<ManualReviewPage />} />
            <Route path="*" element={<Navigate replace to="problems" />} />
          </Route>
        </Route>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Navigate replace to="users" />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:email/edit" element={<AdminEditAccountPage />} />
            <Route path="users/approvals" element={<AdminLecturerApprovalsPage />} />
            <Route path="roles" element={<AdminRolesPage />} />
            <Route path="courses" element={<AdminCoursesPage />} />
            <Route path="classes" element={<AdminCoursesPage />} />
            <Route path="courses/classes/:classId/edit" element={<AdminEditClassPage />} />
            <Route path="courses/lecturers" element={<AdminLecturersPage />} />
            <Route path="overview" element={<AdminOverviewPage />} />
            <Route path="*" element={<Navigate replace to="users" />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={<Navigate replace to={session ? home : "/login"} />}
        />
      </Routes>
    </>
  );
}
