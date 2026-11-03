import { RoleHeader, type WorkspaceHeader } from "./RoleHeader";
export function AppHeader({ workspace }: { workspace?: WorkspaceHeader }) { return <RoleHeader role="student" workspace={workspace} />; }
