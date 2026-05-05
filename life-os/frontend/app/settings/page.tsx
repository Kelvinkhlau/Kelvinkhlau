"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type BackupVersion } from "@/lib/api";
import { Loading } from "@/components/Loading";
import { toast } from "@/components/Toast";
import { PushToggle } from "@/components/PushToggle";
import {
  WEATHER_PRESETS,
  getDisplayName,
  setDisplayName,
  getWeatherLocation,
  setWeatherLocation,
  getAutoMarkRead,
  setAutoMarkRead,
  type WeatherLocation,
} from "@/lib/preferences";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);

  // Profile prefs (localStorage)
  const [displayName, setDisplayNameState] = useState("");
  const [weatherLoc, setWeatherLocState] = useState<WeatherLocation>(WEATHER_PRESETS[0]);
  const [autoMark, setAutoMarkState] = useState(false);

  useEffect(() => {
    setDisplayNameState(getDisplayName());
    setWeatherLocState(getWeatherLocation());
    setAutoMarkState(getAutoMarkRead());
  }, []);

  const handleSaveName = (v: string) => {
    setDisplayNameState(v);
    setDisplayName(v);
  };
  const handlePickWeather = (label: string) => {
    const p = WEATHER_PRESETS.find((w) => w.label === label);
    if (!p) return;
    setWeatherLocState(p);
    setWeatherLocation(p);
    toast.success(`地區已設為：${p.label}`);
  };
  const handleAutoMark = (on: boolean) => {
    setAutoMarkState(on);
    setAutoMarkRead(on);
  };

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ["backup-versions"],
    queryFn: () => api.listBackupVersions(),
  });

  const { data: gmailStatus, isLoading: gmailLoading } = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => api.gmailStatus(),
  });

  const [gmailConnecting, setGmailConnecting] = useState(false);
  const handleConnectGmail = async () => {
    setGmailConnecting(true);
    try {
      const { authorization_url } = await api.gmailAuthorize();
      window.location.href = authorization_url;
    } catch (err) {
      toast.error((err as Error).message);
      setGmailConnecting(false);
    }
  };

  const snapshotMutation = useMutation({
    mutationFn: () => api.createSnapshot(),
    onSuccess: (result) => {
      toast.success(`備份已建立：${result.filename}（${result.size_kb} KB）`);
      queryClient.invalidateQueries({ queryKey: ["backup-versions"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // 完整系統備份（SQLite DB + vault 所有檔案），每星期日 04:00 自動 run
  const { data: systemBackups = [], isLoading: systemLoading } = useQuery({
    queryKey: ["system-backups"],
    queryFn: () => api.listSystemBackups(),
  });

  const systemBackupMutation = useMutation({
    mutationFn: () => api.triggerSystemBackup(),
    onSuccess: (result) => {
      const mb = (result.size_bytes / 1024 / 1024).toFixed(1);
      toast.success(`完整備份已建立：${result.name}（${mb} MB）`);
      queryClient.invalidateQueries({ queryKey: ["system-backups"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      const data = await api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `life-os-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("匯出成功");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="min-h-full max-w-2xl mx-auto p-4 space-y-8">
      <header>
        <h1 className="text-xl font-bold">⚙️ 設定</h1>
      </header>

      {/* Profile —— display name + weather location + email behaviour */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">👤 個人</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Dashboard 會用你嘅名同揀定嘅地區顯示今日天氣。
          </p>
        </div>

        <div className="p-4 border border-border rounded-lg bg-surface space-y-4">
          {/* Name */}
          <label className="block">
            <span className="text-sm font-medium mb-1.5 block">顯示名稱</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => handleSaveName(e.target.value)}
              placeholder="例如 Kelvin"
              className="w-full h-10 px-3 rounded-md bg-background border border-border focus:border-foreground focus:outline-none text-sm"
            />
            <span className="text-xs text-muted-foreground mt-1.5 block">
              留空就只顯示問候語。
            </span>
          </label>

          {/* Weather location */}
          <label className="block">
            <span className="text-sm font-medium mb-1.5 block">天氣地區</span>
            <select
              value={weatherLoc.label}
              onChange={(e) => handlePickWeather(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-background border border-border focus:border-foreground focus:outline-none text-sm"
            >
              {WEATHER_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          {/* Auto mark read */}
          <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-border-subtle">
            <input
              type="checkbox"
              checked={autoMark}
              onChange={(e) => handleAutoMark(e.target.checked)}
              className="mt-0.5 w-4 h-4"
            />
            <div>
              <div className="text-sm font-medium">打開郵件時自動標為已讀</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                關咗之後要自己㩒「標為已讀」先會變。
              </div>
            </div>
          </label>
        </div>
      </section>

      {/* Gmail connection */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">📧 Gmail 連線</h2>
          <p className="text-xs text-muted-foreground mt-1">
            授權 life-os 讀寫 Gmail 同 Google Calendar。Token 過期或者收唔到新 email 嘅時候撳「重新連接」再授權一次。
          </p>
        </div>

        <div className="p-4 border border-border rounded-lg bg-surface space-y-3">
          {gmailLoading ? (
            <Loading />
          ) : gmailStatus?.connected ? (
            <div className="text-sm">
              <div className="font-medium">已連接</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {gmailStatus.email}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">未連接 Gmail</div>
          )}

          <button
            type="button"
            onClick={handleConnectGmail}
            disabled={gmailConnecting}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {gmailConnecting
              ? "跳轉中…"
              : gmailStatus?.connected
                ? "重新連接 Gmail"
                : "連接 Gmail"}
          </button>

          {gmailStatus?.connected && (
            <p className="text-xs text-muted-foreground">
              如果 Google 唔派新 refresh_token 返嚟，先去{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                myaccount.google.com/permissions
              </a>{" "}
              移除舊授權，再嚟過。
            </p>
          )}
        </div>
      </section>

      {/* Push notifications */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">🔔 推送通知</h2>
          <p className="text-xs text-muted-foreground mt-1">
            為每部裝置獨立開關推送通知 — 可以改名、停用、或者刪除唔再用嘅裝置。
            iOS 用戶請先將 app 加入主畫面先可以收 push。
          </p>
        </div>
        <div className="p-3 border border-border rounded-lg bg-background">
          <PushToggle />
        </div>
      </section>

      {/* Backup management */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">💾 備份管理</h2>
          <p className="text-xs text-muted-foreground mt-1">
            建立資料庫 snapshot 或者匯出全部資料做 JSON — 保存返本地最穩陣。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {snapshotMutation.isPending ? "建立中…" : "建立備份 Snapshot"}
          </button>
          <button
            type="button"
            onClick={handleExportAll}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium border border-border rounded bg-background hover:bg-muted disabled:opacity-50"
          >
            {isExporting ? "匯出中…" : "匯出 JSON"}
          </button>
        </div>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            備份版本列表
          </h3>
          {isLoading ? (
            <Loading />
          ) : versions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 border border-dashed border-border rounded-lg text-sm">
              暫時冇備份記錄
            </p>
          ) : (
            <div className="space-y-2">
              {versions.map((v: BackupVersion) => (
                <div
                  key={v.filename}
                  className="flex items-center justify-between p-3 border border-border rounded-lg bg-background"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {v.filename}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(v.date).toLocaleString("zh-HK")} · {v.size_kb} KB
                    </div>
                  </div>
                  <a
                    href={`/api/export/versions/${encodeURIComponent(v.filename)}`}
                    download={v.filename}
                    className="ml-4 text-sm text-blue-600 hover:underline shrink-0"
                  >
                    下載
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* System full backup — SQLite DB + vault 檔案 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">🗄️ 完整系統備份</h2>
          <p className="text-xs text-muted-foreground mt-1">
            包埋 SQLite 資料庫 + vault 所有上載檔案打包成 tar.gz。每星期日 04:00 自動 run，保留最近 12 份。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => systemBackupMutation.mutate()}
            disabled={systemBackupMutation.isPending}
            className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            {systemBackupMutation.isPending ? "備份中…" : "即時建立完整備份"}
          </button>
        </div>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            備份檔案列表
          </h3>
          {systemLoading ? (
            <Loading />
          ) : systemBackups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 border border-dashed border-border rounded-lg text-sm">
              暫時冇完整備份
            </p>
          ) : (
            <div className="space-y-2">
              {systemBackups.map((b) => (
                <div
                  key={b.name}
                  className="flex items-center justify-between p-3 border border-border rounded-lg bg-background"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(b.created_at).toLocaleString("zh-HK")} ·{" "}
                      {(b.size_bytes / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <a
                    href={api.downloadSystemBackupUrl(b.name)}
                    download={b.name}
                    className="ml-4 text-sm text-blue-600 hover:underline shrink-0"
                  >
                    下載
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
