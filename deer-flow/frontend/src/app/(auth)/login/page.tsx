"use client";

import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { useAuth } from "@/core/auth/AuthProvider";
import { parseAuthError } from "@/core/auth/types";
import { BRAND_NAME } from "@/core/brand";

function validateNextParam(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (
    next.startsWith("//") ||
    next.startsWith("http://") ||
    next.startsWith("https://")
  ) {
    return null;
  }
  if (next.includes(":") && !next.startsWith("/")) return null;
  return next;
}

const SCOPE_POINTS = ["A股 / 港股 / 美股", "分钟级行情更新", "多模型协同", "结论可回溯"];

const LEADS = [
  { name: "贵州茅台", match: "98% 匹配", ok: true },
  { name: "宁德时代", match: "95% 匹配", ok: true },
  { name: "英伟达", match: "92% 匹配", ok: true },
  { name: "苹果公司", match: "89% 匹配", ok: true },
  { name: "某弱势股", match: "30% 匹配", ok: false },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [publicRegistrationEnabled, setPublicRegistrationEnabled] =
    useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const nextParam = searchParams.get("next");
  const redirectPath = validateNextParam(nextParam) ?? "/workspace";

  useEffect(() => {
    if (isAuthenticated) router.push(redirectPath);
  }, [isAuthenticated, redirectPath, router]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/auth/setup-status")
      .then((r) => r.json())
      .then(
        (data: {
          needs_setup?: boolean;
          public_registration_enabled?: boolean;
        }) => {
          if (!cancelled) {
            setPublicRegistrationEnabled(
              data.public_registration_enabled === true,
            );
          }
          if (!cancelled && data.needs_setup) router.push("/setup");
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = isLogin
        ? "/api/v1/auth/login/local"
        : "/api/v1/auth/register";
      const body = isLogin
        ? `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
        : JSON.stringify({ email, password });
      const headers: HeadersInit = isLogin
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : { "Content-Type": "application/json" };
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        const authError = parseAuthError(data);
        setError(authError.message);
        return;
      }
      router.push(redirectPath);
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-scope flex min-h-screen w-full overflow-hidden bg-white font-sans">
      {/* Logo — top left */}
      <div className="absolute top-6 left-6 z-50">
        <Link href="/" className="flex items-center gap-2 px-3 py-1.5">
          <BrandMark className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-[#161412]">
            {BRAND_NAME}
          </span>
        </Link>
      </div>

      {/* Left — form */}
      <div className="relative z-20 flex w-full flex-col justify-center bg-white px-10 sm:px-16 lg:w-[50%] xl:w-[50%]">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-10 text-left">
            <h1 className="mb-2 text-[36px] font-medium tracking-tight text-[#161412]">
              {isLogin ? "欢迎回来" : "创建账号"}
            </h1>
            <p className="text-[14px] leading-relaxed text-[#6b6b6b]">
              {isLogin ? "请登录你的 MetaInsight 账号" : "注册一个 MetaInsight 账号"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="ml-1 block text-[12px] font-medium text-[#6b6b6b]"
              >
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="工作邮箱"
                required
                className="h-[52px] w-full rounded-[16px] border-none bg-[#F5F5F7] px-5 text-[14px] text-[#161412] transition-all outline-none placeholder:text-[#9c9c9c] focus-visible:ring-1 focus-visible:ring-[#b0b0b0]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="ml-1 block text-[12px] font-medium text-[#6b6b6b]"
              >
                密码
              </label>
              <div className="group relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  required
                  minLength={isLogin ? 6 : 8}
                  className="h-[52px] w-full rounded-[16px] border-none bg-[#F5F5F7] px-5 pr-12 text-[14px] text-[#161412] transition-all outline-none placeholder:text-[#9c9c9c] focus-visible:ring-1 focus-visible:ring-[#b0b0b0]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer text-[#9c9c9c] transition-colors hover:text-[#4b4b4b]"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <EyeOffIcon width={18} height={18} strokeWidth={1.5} />
                  ) : (
                    <EyeIcon width={18} height={18} strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <p className="ml-1 text-[13px] font-medium text-[#b91c1c]">
                {error}
              </p>
            ) : null}

            <div className="space-y-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="h-[52px] w-full cursor-pointer rounded-[16px] bg-[#121212] text-[15px] font-medium text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "请稍候..." : isLogin ? "登 录" : "创建账号"}
              </button>
            </div>
          </form>

          {publicRegistrationEnabled ? (
            <div className="mt-10 text-center text-[13px] font-medium text-[#161412]/60">
              {isLogin ? "还没有账号？" : "已有账号？"}{" "}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError("");
                }}
                className="text-gray-800 transition-colors hover:text-gray-900"
              >
                {isLogin ? "创建账号" : "直接登录"}
              </button>
            </div>
          ) : (
            <p className="mt-10 text-center text-[12px] text-[#6b6b6b]">
              账号由管理员统一创建，如需使用请联系管理员。
            </p>
          )}
        </div>
      </div>

      {/* Right — painting + glass card */}
      <div className="relative ml-0 hidden flex-1 flex-col justify-end lg:flex">
        <div className="absolute inset-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/landing/painting1.jpg"
            alt="登录背景"
            className="h-full w-full object-cover"
          />
          <div className="absolute top-1/2 left-1/2 z-10 w-[450px] -translate-x-1/2 -translate-y-1/2">
            <div className="rounded-[28px] border border-white/40 bg-white/30 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.1)] backdrop-blur-sm">
              <div className="flex min-w-[280px] flex-col rounded-[20px] bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-[11px] font-semibold tracking-widest text-[#a7a7bb] uppercase">
                  研究范围
                </h3>
                <ul className="mb-6 space-y-3">
                  {SCOPE_POINTS.map((point) => (
                    <li key={point} className="flex items-center gap-3">
                      <CheckIcon className="h-4 w-4 text-[#84cc16]" strokeWidth={3} />
                      <span className="text-[13px] font-medium text-[#4b5563]">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="relative mb-4 flex items-center justify-center py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#f3f4f6]" />
                  </div>
                  <div className="relative flex items-center justify-center rounded-full border border-[#f3f4f6] bg-white p-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14" />
                      <path d="m19 12-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                <h3 className="mb-4 text-[11px] font-semibold tracking-widest text-[#a7a7bb] uppercase">
                  跟踪标的
                </h3>
                <div className="space-y-3">
                  {LEADS.map((lead) => (
                    <div
                      key={lead.name}
                      className={`flex items-center justify-between rounded-[12px] border p-3 ${
                        lead.ok
                          ? "border-[#f3f4f6] shadow-sm"
                          : "border-[#f3f4f6]/50 bg-[#fafafa]/50"
                      }`}
                    >
                      <span
                        className={`text-[13px] font-medium ${lead.ok ? "text-[#4b5563]" : "text-[#9ca3af]"}`}
                      >
                        {lead.name}
                      </span>
                      <div
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
                          lead.ok
                            ? "bg-[#ecfccb]/60 text-[#65a30d]"
                            : "bg-[#ffe4e6]/60 text-[#e11d48]"
                        }`}
                      >
                        <span className="text-[11px] font-semibold">
                          {lead.match}
                        </span>
                        {lead.ok ? (
                          <CheckIcon className="h-3 w-3" strokeWidth={3} />
                        ) : (
                          <XIcon className="h-3 w-3" strokeWidth={3} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
