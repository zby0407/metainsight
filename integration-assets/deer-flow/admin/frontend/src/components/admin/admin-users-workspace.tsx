"use client";

import {
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockKeyholeIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { useAuth } from "@/core/auth/AuthProvider";
import { cn } from "@/lib/utils";

interface ManagedUser {
  id: string;
  email: string;
  system_role: "admin" | "user";
  is_active: boolean;
  needs_setup: boolean;
  created_at: string;
}

interface UsersPayload {
  users: ManagedUser[];
  public_registration_enabled: boolean;
}

interface CreatedCredential {
  email: string;
  temporaryPassword: string;
}

async function errorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    detail?: string | { message?: string };
    message?: string;
  } | null;
  if (typeof payload?.detail === "string") return payload.detail;
  if (payload?.detail && typeof payload.detail === "object") {
    return payload.detail.message || "操作失败";
  }
  return payload?.message || `操作失败（${response.status}）`;
}

function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function UserAvatar({ email }: { email: string }) {
  return (
    <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
      {email.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function AdminUsersWorkspace() {
  const { user: currentUser } = useAuth();
  const [payload, setPayload] = useState<UsersPayload | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [policyWorking, setPolicyWorking] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "user">("user");
  const [creating, setCreating] = useState(false);
  const [createdCredential, setCreatedCredential] =
    useState<CreatedCredential | null>(null);

  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const loadUsers = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetchWithAuth("/api/v1/admin/users", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setPayload((await response.json()) as UsersPayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "用户列表加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return payload?.users ?? [];
    return (payload?.users ?? []).filter((item) =>
      item.email.toLowerCase().includes(normalized),
    );
  }, [payload?.users, query]);

  const stats = useMemo(() => {
    const users = payload?.users ?? [];
    return {
      total: users.length,
      active: users.filter((item) => item.is_active).length,
      admins: users.filter(
        (item) => item.is_active && item.system_role === "admin",
      ).length,
      pending: users.filter((item) => item.needs_setup).length,
    };
  }, [payload?.users]);

  const summaryCards = [
    { label: "用户总数", value: stats.total, icon: UsersRoundIcon },
    { label: "可用账号", value: stats.active, icon: UserCheckIcon },
    { label: "管理员", value: stats.admins, icon: ShieldCheckIcon },
    { label: "待首次改密", value: stats.pending, icon: KeyRoundIcon },
  ];

  const updateUser = async (
    managedUser: ManagedUser,
    patch: Partial<Pick<ManagedUser, "system_role" | "is_active">>,
  ) => {
    setWorkingId(managedUser.id);
    try {
      const response = await fetchWithAuth(
        `/api/v1/admin/users/${managedUser.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      const updated = (await response.json()) as ManagedUser;
      setPayload((current) =>
        current
          ? {
              ...current,
              users: current.users.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      toast.success("用户状态已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setWorkingId(null);
    }
  };

  const updateRegistrationPolicy = async (enabled: boolean) => {
    setPolicyWorking(true);
    try {
      const response = await fetchWithAuth(
        "/api/v1/admin/registration-policy",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_registration_enabled: enabled }),
        },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      setPayload((current) =>
        current
          ? { ...current, public_registration_enabled: enabled }
          : current,
      );
      toast.success(enabled ? "已开放公开注册" : "已关闭公开注册");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "策略更新失败");
    } finally {
      setPolicyWorking(false);
    }
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await fetchWithAuth("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createEmail,
          temporary_password: createPassword,
          system_role: createRole,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const created = (await response.json()) as ManagedUser;
      setPayload((current) =>
        current ? { ...current, users: [...current.users, created] } : current,
      );
      setCreatedCredential({
        email: createEmail,
        temporaryPassword: createPassword,
      });
      toast.success("账号已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreateEmail("");
    setCreatePassword("");
    setCreateRole("user");
    setCreatedCredential(null);
  };

  const copyCredential = async () => {
    if (!createdCredential) return;
    await navigator.clipboard.writeText(
      `登录邮箱：${createdCredential.email}\n临时密码：${createdCredential.temporaryPassword}`,
    );
    toast.success("登录信息已复制");
  };

  const resetManagedPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    try {
      const response = await fetchWithAuth(
        `/api/v1/admin/users/${resetTarget.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ temporary_password: resetPassword }),
        },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      const updated = (await response.json()) as ManagedUser;
      setPayload((current) =>
        current
          ? {
              ...current,
              users: current.users.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      await navigator.clipboard.writeText(resetPassword).catch(() => undefined);
      toast.success("临时密码已重置并复制，旧会话已失效");
      setResetTarget(null);
      setResetPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码重置失败");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="bg-muted/20 flex h-full min-h-0 flex-col">
      <header className="bg-background flex h-16 shrink-0 items-center justify-between border-b px-5 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
            <UsersRoundIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">用户管理</h1>
            <p className="text-muted-foreground hidden text-xs sm:block">
              管理访问权限、账号状态与注册策略
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void loadUsers(true)}
          >
            <RefreshCwIcon
              className={cn("size-4", refreshing && "animate-spin")}
            />
            <span className="hidden sm:inline">刷新</span>
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => {
              setCreatePassword(generateTemporaryPassword());
              setCreateOpen(true);
            }}
          >
            <PlusIcon className="size-4" />
            创建用户
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-muted-foreground text-sm">{label}</p>
                    <p className="mt-1 text-2xl font-semibold">{value}</p>
                  </div>
                  <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
                    <Icon className="text-muted-foreground size-5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LockKeyholeIcon className="size-4" />
                  注册策略
                </CardTitle>
                <CardDescription className="mt-1">
                  默认仅管理员创建账号；开放后，登录页将显示自主注册入口。
                </CardDescription>
              </div>
              <div className="bg-muted/60 flex items-center gap-3 rounded-lg border px-4 py-3">
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {payload?.public_registration_enabled
                      ? "允许公开注册"
                      : "仅管理员创建"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {payload?.public_registration_enabled
                      ? "任何访客都可创建普通账号"
                      : "推荐的安全策略"}
                  </p>
                </div>
                <Switch
                  checked={payload?.public_registration_enabled ?? false}
                  disabled={loading || policyWorking}
                  onCheckedChange={(checked) =>
                    void updateRegistrationPolicy(checked)
                  }
                  aria-label="允许公开注册"
                />
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="gap-4 border-b md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">全部用户</CardTitle>
                <CardDescription className="mt-1">
                  停用或修改角色后，该用户的历史登录会话会立即失效。
                </CardDescription>
              </div>
              <div className="relative w-full md:w-72">
                <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="按邮箱搜索"
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-5">
                  {[0, 1, 2].map((item) => (
                    <Skeleton key={item} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-muted-foreground py-14 text-center text-sm">
                  没有匹配的用户
                </div>
              ) : (
                <div className="divide-y">
                  {filteredUsers.map((managedUser) => {
                    const isSelf = managedUser.id === currentUser?.id;
                    const isWorking = workingId === managedUser.id;
                    return (
                      <div
                        key={managedUser.id}
                        className="grid gap-4 p-5 lg:grid-cols-[minmax(260px,1fr)_170px_170px_130px] lg:items-center"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar email={managedUser.email} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">
                                {managedUser.email}
                              </p>
                              {isSelf && (
                                <Badge variant="secondary">当前账号</Badge>
                              )}
                              {managedUser.needs_setup && (
                                <Badge variant="outline">待首次改密</Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground mt-1 text-xs">
                              创建于 {formatCreatedAt(managedUser.created_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:block">
                          <span className="text-muted-foreground text-xs lg:hidden">
                            角色
                          </span>
                          <Select
                            value={managedUser.system_role}
                            disabled={isSelf || isWorking}
                            onValueChange={(value: "admin" | "user") =>
                              void updateUser(managedUser, {
                                system_role: value,
                              })
                            }
                          >
                            <SelectTrigger className="w-36 lg:w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">普通用户</SelectItem>
                              <SelectItem value="admin">管理员</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">
                              {managedUser.is_active ? "正常使用" : "已停用"}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {managedUser.is_active ? "允许登录" : "拒绝登录"}
                            </p>
                          </div>
                          {isWorking ? (
                            <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
                          ) : (
                            <Switch
                              checked={managedUser.is_active}
                              disabled={isSelf}
                              onCheckedChange={(checked) =>
                                void updateUser(managedUser, {
                                  is_active: checked,
                                })
                              }
                              aria-label={`${managedUser.email}账号状态`}
                            />
                          )}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={isSelf}
                          onClick={() => {
                            setResetTarget(managedUser);
                            setResetPassword(generateTemporaryPassword());
                          }}
                        >
                          <KeyRoundIcon className="size-4" />
                          重置密码
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => !open && closeCreateDialog()}
      >
        <DialogContent className="sm:max-w-lg">
          {createdCredential ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2Icon className="size-5 text-emerald-500" />
                  账号已创建
                </DialogTitle>
                <DialogDescription>
                  请把临时登录信息安全地发给用户。首次登录后系统会要求其修改密码。
                </DialogDescription>
              </DialogHeader>
              <div className="bg-muted space-y-3 rounded-lg border p-4 font-mono text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">登录邮箱</p>
                  <p className="mt-1 break-all">{createdCredential.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">临时密码</p>
                  <p className="mt-1 break-all">
                    {createdCredential.temporaryPassword}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => void copyCredential()}>
                  <CopyIcon className="mr-2 size-4" />
                  复制登录信息
                </Button>
                <Button onClick={closeCreateDialog}>完成</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={createUser} className="space-y-5">
              <DialogHeader>
                <DialogTitle>创建用户</DialogTitle>
                <DialogDescription>
                  创建后用户使用临时密码登录，并在首次登录时设置自己的密码。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="managed-user-email"
                    className="text-sm font-medium"
                  >
                    邮箱
                  </label>
                  <Input
                    id="managed-user-email"
                    type="email"
                    value={createEmail}
                    onChange={(event) => setCreateEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="managed-user-role"
                    className="text-sm font-medium"
                  >
                    角色
                  </label>
                  <Select
                    value={createRole}
                    onValueChange={(value: "admin" | "user") =>
                      setCreateRole(value)
                    }
                  >
                    <SelectTrigger id="managed-user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">普通用户</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="managed-user-password"
                    className="text-sm font-medium"
                  >
                    临时密码
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="managed-user-password"
                      value={createPassword}
                      onChange={(event) =>
                        setCreatePassword(event.target.value)
                      }
                      minLength={8}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setCreatePassword(generateTemporaryPassword())
                      }
                    >
                      重新生成
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreateDialog}
                >
                  取消
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating && (
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                  )}
                  创建账号
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setResetPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={resetManagedPassword} className="space-y-5">
            <DialogHeader>
              <DialogTitle>重置临时密码</DialogTitle>
              <DialogDescription>
                {resetTarget?.email}{" "}
                的现有会话会立即失效，下次登录后必须再次修改密码。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label
                htmlFor="reset-managed-password"
                className="text-sm font-medium"
              >
                新临时密码
              </label>
              <div className="flex gap-2">
                <Input
                  id="reset-managed-password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  minLength={8}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetPassword(generateTemporaryPassword())}
                >
                  重新生成
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                重置成功后会自动把临时密码复制到剪贴板。
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetTarget(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={resetting}>
                {resetting && (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                )}
                确认重置
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
