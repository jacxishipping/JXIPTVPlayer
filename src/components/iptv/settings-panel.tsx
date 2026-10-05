"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import {
  Palette,
  Gauge,
  Shield,
  Database,
  Download,
  Upload,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Keyboard,
} from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { getDb, loadSettings, saveSettings, clearAll } from "@/lib/iptv/db";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

const ACCENTS: { name: string; value: string; swatch: string }[] = [
  { name: "Rose", value: "oklch(0.65 0.24 18)", swatch: "oklch(0.65 0.24 18)" },
  { name: "Amber", value: "oklch(0.72 0.18 65)", swatch: "oklch(0.72 0.18 65)" },
  { name: "Green", value: "oklch(0.65 0.18 145)", swatch: "oklch(0.65 0.18 145)" },
  { name: "Cyan", value: "oklch(0.7 0.13 195)", swatch: "oklch(0.7 0.13 195)" },
  { name: "Violet", value: "oklch(0.62 0.21 305)", swatch: "oklch(0.62 0.21 305)" },
  { name: "Crimson", value: "oklch(0.55 0.23 12)", swatch: "oklch(0.55 0.23 12)" },
];

export function SettingsPanel() {
  const { settings, setSettings, setKeyboardHelpOpen, setPlaylists, setActivePlaylist, setChannels } = useIptv();
  const { setTheme } = useTheme();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const update = async (patch: Partial<typeof settings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
    if (patch.theme) {
      if (patch.theme === "light") {
        document.documentElement.classList.remove("dark");
        setTheme("light");
      } else if (patch.theme === "dark") {
        document.documentElement.classList.add("dark");
        setTheme("dark");
      } else {
        setTheme("system");
      }
    }
    if (patch.accent) {
      document.documentElement.style.setProperty("--primary", patch.accent);
      document.documentElement.style.setProperty("--ring", patch.accent);
      document.documentElement.style.setProperty("--sidebar-primary", patch.accent);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const db = getDb();
      const data = {
        exportedAt: new Date().toISOString(),
        settings: await loadSettings(),
        playlists: await db.playlists.toArray(),
        channels: await db.channels.toArray(),
        favorites: await db.favorites.toArray(),
        history: await db.history.toArray(),
        profiles: await db.profiles.toArray(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `streamline-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported" });
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const importData = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const db = getDb();
      if (Array.isArray(data.playlists)) {
        await db.playlists.bulkPut(data.playlists);
        await db.channels.bulkPut(data.channels ?? []);
        await db.favorites.bulkPut(data.favorites ?? []);
        await db.history.bulkPut(data.history ?? []);
        const all = await db.playlists.toArray();
        setPlaylists(all);
        if (all[0]) {
          setActivePlaylist(all[0].id);
          const chs = await db.channels.where("playlistId").equals(all[0].id).toArray();
          setChannels(chs, Array.from(new Set(chs.map((c) => c.group ?? "All"))).sort());
        }
        toast({ title: "Data imported" });
      }
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const wipeAll = async () => {
    if (!confirm("This will delete ALL playlists, channels, favorites, and history. Continue?")) return;
    await clearAll();
    setPlaylists([]);
    setActivePlaylist(null);
    setChannels([], []);
    toast({ title: "All data cleared" });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 lg:px-6 py-8 space-y-8">
      <header>
        <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Personalize your Streamline experience.</p>
      </header>

      {/* Appearance */}
      <section className="space-y-4">
        <SectionHeader icon={<Palette className="h-5 w-5" />} title="Appearance" />
        <div className="grid gap-5 rounded-2xl border border-border/60 bg-card p-5">
          <div>
            <Label className="text-sm font-medium">Theme</Label>
            <RadioGroup
              value={settings.theme}
              onValueChange={(v) => update({ theme: v as "dark" | "light" | "system" })}
              className="mt-3 grid grid-cols-3 gap-2"
            >
              {[
                { v: "dark", label: "Dark", icon: Moon },
                { v: "light", label: "Light", icon: Sun },
                { v: "system", label: "System", icon: Monitor },
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <Label
                    key={opt.v}
                    htmlFor={`theme-${opt.v}`}
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 transition ${
                      settings.theme === opt.v ? "border-primary bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <RadioGroupItem value={opt.v} id={`theme-${opt.v}`} className="sr-only" />
                    <Icon className="h-5 w-5" />
                    <span className="text-sm">{opt.label}</span>
                  </Label>
                );
              })}
            </RadioGroup>
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium">Accent colour</Label>
            <div className="mt-3 flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.name}
                  onClick={() => update({ accent: a.value })}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${
                    settings.accent === a.value ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ background: a.swatch }}
                  aria-label={a.name}
                  title={a.name}
                />
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Reduce motion</Label>
              <p className="text-xs text-muted-foreground">Minimize animations and transitions.</p>
            </div>
            <Switch checked={settings.reducedMotion} onCheckedChange={(v) => update({ reducedMotion: v })} />
          </div>
        </div>
      </section>

      {/* Playback */}
      <section className="space-y-4">
        <SectionHeader icon={<Gauge className="h-5 w-5" />} title="Playback" />
        <div className="grid gap-5 rounded-2xl border border-border/60 bg-card p-5">
          <div>
            <Label className="text-sm font-medium">Default player engine</Label>
            <Select
              value={settings.defaultEngine}
              onValueChange={(v) => update({ defaultEngine: v as typeof settings.defaultEngine })}
            >
              <SelectTrigger className="mt-2 w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="hls">hls.js (HLS)</SelectItem>
                <SelectItem value="mpegts">mpegts.js (MPEG-TS / FLV)</SelectItem>
                <SelectItem value="native">Native &lt;video&gt;</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Auto picks based on the stream URL.</p>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Buffer size</Label>
              <span className="text-sm text-muted-foreground">{settings.bufferSeconds}s</span>
            </div>
            <Slider
              value={[settings.bufferSeconds]}
              min={2}
              max={30}
              step={1}
              onValueChange={([v]) => update({ bufferSeconds: v })}
              className="mt-3"
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-hide controls</Label>
              <p className="text-xs text-muted-foreground">Hide the player UI after 3s of inactivity.</p>
            </div>
            <Switch checked={settings.autoHideControls} onCheckedChange={(v) => update({ autoHideControls: v })} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Autoplay next</Label>
              <p className="text-xs text-muted-foreground">Continue to the next channel in the queue.</p>
            </div>
            <Switch checked={settings.autoplayNext} onCheckedChange={(v) => update({ autoplayNext: v })} />
          </div>
        </div>
      </section>

      {/* Privacy / Proxy */}
      <section className="space-y-4">
        <SectionHeader icon={<Shield className="h-5 w-5" />} title="Privacy & Proxy" />
        <div className="grid gap-5 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Use CORS proxy</Label>
              <p className="text-xs text-muted-foreground">
                Route streams through the built-in proxy to bypass CORS / mixed content.
              </p>
            </div>
            <Switch checked={settings.proxyEnabled} onCheckedChange={(v) => update({ proxyEnabled: v })} />
          </div>
          {settings.proxyEnabled && (
            <div>
              <Label htmlFor="proxy-url" className="text-sm font-medium">Proxy URL (optional)</Label>
              <input
                id="proxy-url"
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="/api/proxy"
                value={settings.proxyUrl ?? "/api/proxy"}
                onChange={(e) => update({ proxyUrl: e.target.value })}
              />
            </div>
          )}
        </div>
      </section>

      {/* Data */}
      <section className="space-y-4">
        <SectionHeader icon={<Database className="h-5 w-5" />} title="Data" />
        <div className="grid gap-3 rounded-2xl border border-border/60 bg-card p-5">
          <Button variant="outline" onClick={exportData} disabled={exporting} className="justify-start">
            <Download className="mr-2 h-4 w-4" /> Export backup (JSON)
          </Button>
          <label className="block">
            <span className="sr-only">Import backup</span>
            <Button variant="outline" className="w-full justify-start pointer-events-none">
              <Upload className="mr-2 h-4 w-4" /> Import backup
            </Button>
            <input
              type="file"
              accept="application/json"
              className="opacity-0 absolute -translate-y-12 h-10 w-[260px] cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
              }}
            />
          </label>
          <Separator />
          <Button variant="destructive" onClick={wipeAll} className="justify-start">
            <Trash2 className="mr-2 h-4 w-4" /> Clear all data
          </Button>
        </div>
      </section>

      {/* Keyboard shortcuts */}
      <section className="space-y-4">
        <SectionHeader icon={<Keyboard className="h-5 w-5" />} title="Keyboard shortcuts" />
        <div className="rounded-2xl border border-border/60 bg-card p-5 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Press <kbd className="rounded border border-border/60 px-1.5 py-0.5 font-mono">?</kbd> anywhere to see all shortcuts.
          </p>
          <Button variant="outline" onClick={() => setKeyboardHelpOpen(true)}>
            <Keyboard className="mr-2 h-4 w-4" />
            Show cheatsheet
          </Button>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}
