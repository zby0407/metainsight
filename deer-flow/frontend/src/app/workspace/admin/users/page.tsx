import { redirect } from "next/navigation";

import { AdminUsersWorkspace } from "@/components/admin/admin-users-workspace";
import { getServerSideUser } from "@/core/auth/server";

export default async function AdminUsersPage() {
  const auth = await getServerSideUser();

  if (auth.tag === "authenticated" && auth.user.system_role === "admin") {
    return <AdminUsersWorkspace />;
  }

  if (auth.tag === "authenticated") {
    redirect("/workspace/chats");
  }

  redirect("/login");
}
