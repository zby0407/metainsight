"use client";

import { BellIcon, NewspaperIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fetch as fetchWithAuth } from "@/core/api/fetcher";
import { useI18n } from "@/core/i18n/hooks";
import { useNotification } from "@/core/notification/hooks";
import { useLocalSettings } from "@/core/settings";

import { SettingsSection } from "./settings-section";

const DIGEST_API = "/api/v1/digest-push/settings";
const DIGEST_TRIGGER_API = "/api/v1/digest-push/trigger";

interface DigestSettings {
  dailyBriefEnabled: boolean;
  dailySummaryEnabled: boolean;
  weeklySummaryEnabled: boolean;
  monthlySummaryEnabled: boolean;
  scheduleTime: string;
  timezone: string;
  weeklyWeekday: number;
}

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

async function loadDigestSettings(): Promise<DigestSettings> {
  const response = await fetchWithAuth(DIGEST_API);
  const payload = (await response.json().catch(() => ({}))) as
    | DigestSettings
    | { detail?: string };
  if (!response.ok) {
    throw new Error(
      "detail" in payload && payload.detail
        ? String(payload.detail)
        : `加载推送设置失败：${response.status}`,
    );
  }
  return payload as DigestSettings;
}

export function NotificationSettingsPage() {
  const { t } = useI18n();
  const { permission, isSupported, requestPermission, showNotification } =
    useNotification();

  const [settings, setSettings] = useLocalSettings();
  const [digest, setDigest] = useState<DigestSettings | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);
  const [digestSaving, setDigestSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadDigestSettings()
      .then((next) => {
        if (!cancelled) setDigest(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "推送订阅加载失败",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDigestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRequestPermission = async () => {
    await requestPermission();
  };

  const handleTestNotification = () => {
    showNotification(t.settings.notification.testTitle, {
      body: t.settings.notification.testBody,
    });
  };

  const handleEnableNotification = async (enabled: boolean) => {
    setSettings("notification", {
      enabled,
    });
  };

  const updateDigest = async (patch: Partial<DigestSettings>) => {
    if (!digest) return;
    const next = { ...digest, ...patch };
    setDigest(next);
    setDigestSaving(true);
    try {
      const response = await fetchWithAuth(DIGEST_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyBriefEnabled: next.dailyBriefEnabled,
          dailySummaryEnabled: next.dailySummaryEnabled,
          weeklySummaryEnabled: next.weeklySummaryEnabled,
          monthlySummaryEnabled: next.monthlySummaryEnabled,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | DigestSettings
        | { detail?: string };
      if (!response.ok) {
        throw new Error(
          "detail" in payload && payload.detail
            ? String(payload.detail)
            : `保存失败：${response.status}`,
        );
      }
      setDigest(payload as DigestSettings);
      toast.success("推送订阅已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "推送设置保存失败");
      try {
        setDigest(await loadDigestSettings());
      } catch {
        /* ignore reload error */
      }
    } finally {
      setDigestSaving(false);
    }
  };

  const triggerNow = async () => {
    setTriggering(true);
    try {
      const response = await fetchWithAuth(DIGEST_TRIGGER_API, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(payload.detail || `触发失败：${response.status}`);
      }
      toast.success(payload.message || "已触发推送");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "触发推送失败");
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="政策与行情推送"
        description="每日接收政策动态与市场行情，并可选日/周/月投研总结，送达通知中心。"
      >
        {digestLoading || !digest ? (
          <p className="text-muted-foreground text-sm">正在加载推送订阅…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-xs">
              交易日 {digest.scheduleTime}（{digest.timezone}）后检查；周总结默认在
              {WEEKDAY_LABELS[digest.weeklyWeekday] ?? "周五"} 发送；月总结在每月 1
              日回顾上月。
            </p>

            {(
              [
                {
                  key: "dailyBriefEnabled" as const,
                  label: "每日政策与行情速递",
                  hint: "当日主要指数涨跌 + 政策/宏观要点",
                },
                {
                  key: "dailySummaryEnabled" as const,
                  label: "投研日总结",
                  hint: "汇总当日行情、政策与自选自动研究",
                },
                {
                  key: "weeklySummaryEnabled" as const,
                  label: "投研周总结",
                  hint: "本周行情、政策与自选研究回顾",
                },
                {
                  key: "monthlySummaryEnabled" as const,
                  label: "投研月总结",
                  hint: "上月投研与政策要点回顾",
                },
              ] as const
            ).map((item) => (
              <div
                className="flex items-start justify-between gap-4 rounded-lg border px-3 py-3"
                key={item.key}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <NewspaperIcon className="text-muted-foreground size-3.5" />
                    {item.label}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">{item.hint}</p>
                </div>
                <Switch
                  aria-label={item.label}
                  checked={digest[item.key]}
                  disabled={digestSaving}
                  onCheckedChange={(checked) =>
                    void updateDigest({ [item.key]: checked })
                  }
                />
              </div>
            ))}

            <Button
              disabled={triggering || digestSaving}
              onClick={() => void triggerNow()}
              size="sm"
              variant="outline"
            >
              {triggering ? "正在推送…" : "立即推送一次（测试）"}
            </Button>
          </div>
        )}
      </SettingsSection>

      {isSupported ? (
        <SettingsSection
          title={t.settings.notification.title}
          description={
            <div className="flex items-center gap-2">
              <div>{t.settings.notification.description}</div>
              <div>
                <Switch
                  disabled={permission !== "granted"}
                  checked={
                    permission === "granted" && settings.notification.enabled
                  }
                  onCheckedChange={handleEnableNotification}
                />
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            {permission === "default" && (
              <Button onClick={handleRequestPermission} variant="default">
                <BellIcon className="mr-2 size-4" />
                {t.settings.notification.requestPermission}
              </Button>
            )}

            {permission === "denied" && (
              <p className="text-muted-foreground rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/50">
                {t.settings.notification.deniedHint}
              </p>
            )}

            {permission === "granted" && settings.notification.enabled && (
              <div className="flex flex-col gap-4">
                <Button onClick={handleTestNotification} variant="outline">
                  <BellIcon className="mr-2 size-4" />
                  {t.settings.notification.testButton}
                </Button>
              </div>
            )}
          </div>
        </SettingsSection>
      ) : (
        <SettingsSection
          title={t.settings.notification.title}
          description={t.settings.notification.description}
        >
          <p className="text-muted-foreground text-sm">
            {t.settings.notification.notSupported}
          </p>
        </SettingsSection>
      )}
    </div>
  );
}
