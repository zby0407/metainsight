"use client";

import {
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    return payload.detail.message ?? "操作失败";
  }
  return payload?.message ?? `操作失败（${response.status}）`;
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
    <div className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
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
    <div className="bg-background flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold">用户管理</h1>
          <p className="text-muted-foreground hidden text-xs sm:block">
            账号、角色与登录权限
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={refreshing}
            onClick={() => void loadUsers(true)}
            aria-label="刷新用户列表"
          >
            <RefreshCwIcon
              className={cn("size-4", refreshing && "animate-spin")}
            />
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
            新增用户
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
        <section className="bg-card mx-auto max-w-6xl overflow-hidden rounded-xl border">
          <div className="flex flex-col gap-4 border-b px-4 py-4 md:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">账号目录</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {stats.total} 个账号 · {stats.active} 个可用 · {stats.admins}{" "}
                个管理员
                {stats.pending > 0 && ` · ${stats.pending} 个待改密`}
              </p>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-5 lg:justify-end">
              <div className="min-w-0 text-right">
                <p className="text-xs font-medium">开放自主注册</p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {payload?.public_registration_enabled
                    ? "登录页已开放注册入口"
                    : "当前仅管理员可新增账号"}
                </p>
              </div>
              <Switch
                checked={payload?.public_registration_enabled ?? false}
                disabled={loading || policyWorking}
                onCheckedChange={(checked) =>
                  void updateRegistrationPolicy(checked)
                }
                aria-label="开放自主注册"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
            <div className="relative w-full md:w-72">
              <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="按邮箱搜索"
                className="h-9 pl-9"
                aria-label="按邮箱搜索用户"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              修改角色、停用账号或重置密码后，原有登录会话会立即失效
            </p>
          </div>

          <div className="text-muted-foreground bg-muted/30 hidden grid-cols-[minmax(250px,1.5fr)_140px_120px_120px_110px] gap-4 border-b px-5 py-2.5 text-[11px] font-medium md:grid">
            <span>用户</span>
            <span>角色</span>
            <span>登录状态</span>
            <span>创建时间</span>
            <span className="text-right">操作</span>
          </div>

          {loading ? (
            <div className="divide-y">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(250px,1.5fr)_140px_120px_120px_110px] md:px-5"
                >
                  <Skeleton className="h-9 w-full max-w-64" />
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-9 w-24" />
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-medium">没有匹配的账号</p>
              <p className="text-muted-foreground mt-1 text-xs">
                请尝试其他邮箱关键词
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredUsers.map((managedUser) => {
                const isSelf = managedUser.id === currentUser?.id;
                const isWorking = workingId === managedUser.id;
                return (
                  <div
                    key={managedUser.id}
                    className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(250px,1.5fr)_140px_120px_120px_110px] md:items-center md:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar email={managedUser.email} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <p className="max-w-full truncate text-sm font-medium">
                            {managedUser.email}
                          </p>
                          {isSelf && (
                            <Badge
                              variant="secondary"
                              className="h-5 rounded px-1.5 text-[10px] font-medium"
                            >
                              当前账号
                            </Badge>
                          )}
                          {managedUser.needs_setup && (
                            <Badge
                              variant="outline"
                              className="h-5 rounded px-1.5 text-[10px] font-medium"
                            >
                              待改密
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs md:hidden">
                          创建于 {formatCreatedAt(managedUser.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-muted-foreground text-xs md:hidden">
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
                        <SelectTrigger className="h-8 w-36 text-xs md:w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">普通用户</SelectItem>
                          <SelectItem value="admin">管理员</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-xs md:hidden">
                        登录状态
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            managedUser.is_active
                              ? "bg-emerald-500"
                              : "bg-muted-foreground/50",
                          )}
                          aria-hidden="true"
                        />
                        <span className="text-xs">
                          {managedUser.is_active ? "正常" : "已停用"}
                        </span>
                        {isWorking ? (
                          <Loader2Icon className="text-muted-foreground ml-1 size-4 animate-spin" />
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
                            className="ml-1 scale-90"
                          />
                        )}
                      </div>
                    </div>

                    <p className="text-muted-foreground hidden text-xs md:block">
                      {formatCreatedAt(managedUser.created_at)}
                    </p>

                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2 text-xs"
                        disabled={isSelf}
                        onClick={() => {
                          setResetTarget(managedUser);
                          setResetPassword(generateTemporaryPassword());
                        }}
                      >
                        <KeyRoundIcon className="size-3.5" />
                        重置密码
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filteredUsers.length > 0 && (
            <div className="text-muted-foreground border-t px-5 py-3 text-xs">
              显示 {filteredUsers.length} / {stats.total} 个账号
            </div>
          )}
        </section>
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
