"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Link2,
  Upload,
  Code2,
  Play,
  ShieldCheck,
  Sparkles,
  Tv,
  ChevronRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { getDb, loadSettings, replacePlaylistChannels, savePlaylist } from "@/lib/iptv/db";
import { parseM3U } from "@/lib/iptv/m3u-parser";
import { DEMO_PLAYLIST_M3U, DEMO_PLAYLIST_ID, DEMO_PLAYLIST_NAME } from "@/lib/iptv/demo";
import { authenticateXtream, importXtreamContent } from "@/lib/iptv/xtream";
import type { Playlist, SourceType } from "@/lib/iptv/types";

type Step = "welcome" | "source" | "configure" | "loading" | "done";

export function OnboardingWizard() {
  const router = useRouter();
  const { setOnboardingOpen, setPlaylists, setActivePlaylist } = useIptv();
  const [step, setStep] = useState<Step>("welcome");
  const [sourceType, setSourceType] = useState<SourceType>("m3u-url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [channelCount, setChannelCount] = useState(0);
  const [xtreamServer, setXtreamServer] = useState("");
  const [xtreamUser, setXtreamUser] = useState("");
  const [xtreamPass, setXtreamPass] = useState("");
  const [includeLive, setIncludeLive] = useState(true);
  const [includeVod, setIncludeVod] = useState(true);
  const [includeSeries, setIncludeSeries] = useState(true);
  const [useProxy, setUseProxy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadSettings().then((settings) => {
      setUseProxy(Boolean(settings.proxyEnabled));
    });
  }, []);

  const startDemo = useCallback(async () => {
    setStep("loading");
    setProgress(5);
    setError(null);
    try {
      const db = getDb();
      const playlist: Playlist = {
        id: DEMO_PLAYLIST_ID,
        name: DEMO_PLAYLIST_NAME,
        type: "text",
        channelCount: 0,
        addedAt: Date.now(),
        lastRefreshedAt: Date.now(),
      };
      await db.playlists.put(playlist);
      setProgress(30);
      let seen = 0;
      const result = parseM3U(DEMO_PLAYLIST_M3U, DEMO_PLAYLIST_ID, (p) => {
        seen = p;
        setProgress(30 + Math.min(40, (p / 200) * 40));
      });
      setProgress(70);
      await replacePlaylistChannels(DEMO_PLAYLIST_ID, result.channels);
      await savePlaylist({ ...playlist, channelCount: result.count });
      setProgress(100);
      setChannelCount(result.count);
      void seen;
      const all = await db.playlists.toArray();
      all.sort((a, b) => a.addedAt - b.addedAt);
      setPlaylists(all);
      setActivePlaylist(DEMO_PLAYLIST_ID);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("configure");
    }
  }, [setPlaylists, setActivePlaylist]);

  const addSource = useCallback(async () => {
    setError(null);
    if (sourceType === "m3u-url") {
      if (!url.trim()) return setError("Please paste an M3U/M3U8 URL.");
      try {
        new URL(url.trim());
      } catch {
        return setError("That doesn't look like a valid URL.");
      }
    }
    if (sourceType === "text" && !text.trim()) {
      return setError("Paste your M3U content first.");
    }
    if (sourceType === "m3u-file" && !text.trim()) {
      return setError("Choose a file to upload first.");
    }
    if (sourceType === "xtream") {
      if (!xtreamServer.trim() || !xtreamUser.trim() || !xtreamPass.trim()) {
        return setError("Please provide Server URL, Username, and Password.");
      }
    }
    setStep("loading");
    setProgress(5);
    try {
      const db = getDb();
      const id = `pl_${Date.now().toString(36)}`;
      const defaultName =
        sourceType === "m3u-url"
          ? new URL(url).hostname
          : sourceType === "xtream"
          ? "Xtream (" + xtreamUser.trim() + ")"
          : "My Playlist";
      const pl: Playlist = {
        id,
        name: name.trim() || defaultName,
        type: sourceType,
        url: sourceType === "m3u-url" ? url.trim() : sourceType === "xtream" ? xtreamServer.trim() : undefined,
        channelCount: 0,
        addedAt: Date.now(),
        lastRefreshedAt: Date.now(),
      };
      await db.playlists.put(pl);
      setProgress(15);

      if (sourceType === "xtream") {
        const creds = {
          server: xtreamServer.trim(),
          username: xtreamUser.trim(),
          password: xtreamPass.trim(),
        };
        setProgress(25);
        await authenticateXtream(creds);
        setProgress(45);
        const result = await importXtreamContent(creds, id, {
          includeLive,
          includeVod,
          includeSeries,
          onProgress: (_msg, count) => {
            setProgress((prev) => Math.min(85, prev + 3));
          },
        });
        setProgress(90);
        await replacePlaylistChannels(id, result.channels);
        pl.channelCount = result.count;
        pl.credentials = btoa(JSON.stringify(creds));
        await savePlaylist(pl);
        const all = await db.playlists.toArray();
        all.sort((a, b) => a.addedAt - b.addedAt);
        setPlaylists(all);
        setActivePlaylist(id);
        setChannelCount(result.count);
        setProgress(100);
        setStep("done");
        return;
      }

      let sourceText = "";
      if (sourceType === "m3u-url") {
        const targetUrl = url.trim();
        const fetchPlaylistText = async () => {
          if (useProxy) {
            const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`);
            if (!proxyRes.ok) {
              throw new Error(`HTTP ${proxyRes.status} fetching playlist via proxy.`);
            }
            return await proxyRes.text();
          }

          try {
            const res = await fetch(targetUrl, { mode: "cors" });
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching playlist.`);
            return await res.text();
          } catch {
            const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`);
            if (!proxyRes.ok) {
              throw new Error(`HTTP ${proxyRes.status} fetching playlist via proxy.`);
            }
            return await proxyRes.text();
          }
        };

        sourceText = await fetchPlaylistText();
      } else {
        sourceText = text;
      }
      setProgress(45);

      const result = parseM3U(sourceText, id, (p) => {
        setProgress(45 + Math.min(40, (p / 200) * 40));
      });
      setProgress(85);
      await replacePlaylistChannels(id, result.channels);
      await savePlaylist({ ...pl, channelCount: result.count });
      const all = await db.playlists.toArray();
      all.sort((a, b) => a.addedAt - b.addedAt);
      setPlaylists(all);
      setActivePlaylist(id);
      setChannelCount(result.count);
      setProgress(100);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("configure");
    }
  }, [sourceType, name, url, text, xtreamServer, xtreamUser, xtreamPass, includeLive, includeVod, includeSeries, useProxy, setPlaylists, setActivePlaylist]);

  const onFile = useCallback(async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    setText(text);
    setName((n) => n || file.name.replace(/\.m3u8?$/i, ""));
  }, []);

  const finish = () => {
    setOnboardingOpen(false);
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl p-4">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        className="w-full max-w-2xl"
      >
        <div className="glass-strong rounded-3xl p-8 md:p-10 shadow-2xl border">
          <AnimatePresence mode="wait">
            {step === "welcome" && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-center"
              >
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                  <Tv className="h-10 w-10" />
                </div>
                <h1 className="font-[var(--font-display)] text-4xl font-bold tracking-tight">
                  Welcome to <span className="text-primary">Streamline</span>
                </h1>
                <p className="mt-3 text-lg text-muted-foreground">
                  A premium IPTV player. Beautiful, fast, keyboard-friendly — and a player only.
                </p>
                <Alert className="mt-6 text-left border-primary/30 bg-primary/5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <AlertDescription>
                    Streamline ships with <strong>no channels, playlists, or streams</strong>. Add
                    only content you have the right to access.
                  </AlertDescription>
                </Alert>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button size="lg" className="h-12 px-6 text-base" onClick={startDemo}>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Try the demo (legal test streams)
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 px-6 text-base"
                    onClick={() => setStep("source")}
                  >
                    Add my own source
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "source" && (
              <motion.div
                key="source"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <button
                  className="text-sm text-muted-foreground hover:text-foreground mb-4"
                  onClick={() => setStep("welcome")}
                >
                  ← Back
                </button>
                <h2 className="text-2xl font-bold">Add a source</h2>
                <p className="mt-2 text-muted-foreground">How would you like to add channels?</p>
                <RadioGroup
                  value={sourceType}
                  onValueChange={(v) => setSourceType(v as SourceType)}
                  className="mt-6 grid gap-3"
                >
                  <SourceOption
                    value="m3u-url"
                    icon={<Link2 className="h-5 w-5" />}
                    title="M3U / M3U8 URL"
                    desc="Paste a public playlist link"
                    selected={sourceType === "m3u-url"}
                  />
                  <SourceOption
                    value="m3u-file"
                    icon={<Upload className="h-5 w-5" />}
                    title="Upload M3U file"
                    desc="Choose a .m3u file from your device"
                    selected={sourceType === "m3u-file"}
                  />
                  <SourceOption
                    value="text"
                    icon={<Code2 className="h-5 w-5" />}
                    title="Paste M3U text"
                    desc="Paste raw #EXTM3U content"
                    selected={sourceType === "text"}
                  />
                  <SourceOption
                    value="xtream"
                    icon={<Play className="h-5 w-5" />}
                    title="Xtream Codes"
                    desc="Server URL + username + password"
                    selected={sourceType === "xtream"}
                  />
                </RadioGroup>
                <div className="mt-8 flex justify-end">
                  <Button onClick={() => setStep("configure")}>
                    Continue
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "configure" && (
              <motion.div
                key="configure"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <button
                  className="text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setStep("source")}
                >
                  ← Back
                </button>
                <h2 className="text-2xl font-bold">Configure</h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="pl-name">Playlist name</Label>
                    <Input
                      id="pl-name"
                      placeholder="e.g. My Channels"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  {sourceType === "m3u-url" && (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="pl-url">M3U / M3U8 URL</Label>
                        <Input
                          id="pl-url"
                          placeholder="https://example.com/playlist.m3u8"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">Use proxy</p>
                          <p className="text-xs text-muted-foreground">Bypass CORS / mixed-content issues for blocked sources.</p>
                        </div>
                        <Switch checked={useProxy} onCheckedChange={setUseProxy} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        If the source is blocked, the app will route the request through the proxy.
                      </p>
                    </div>
                  )}
                  {sourceType === "m3u-file" && (
                    <div>
                      <Label>File</Label>
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-6 text-left transition hover:bg-muted"
                      >
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <span className="text-sm">
                          {fileName || "Click to choose an .m3u file"}
                        </span>
                      </button>
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".m3u,.m3u8,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onFile(f);
                        }}
                      />
                    </div>
                  )}
                  {sourceType === "text" && (
                    <div>
                      <Label htmlFor="pl-text">M3U content</Label>
                      <Textarea
                        id="pl-text"
                        rows={8}
                        placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-id=&quot;1&quot; ...&#10;https://..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                  {sourceType === "xtream" && (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="xt-server">Server URL</Label>
                        <Input
                          id="xt-server"
                          placeholder="http://iptv-server.com:8080"
                          value={xtreamServer}
                          onChange={(e) => setXtreamServer(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="xt-user">Username</Label>
                          <Input
                            id="xt-user"
                            placeholder="username"
                            value={xtreamUser}
                            onChange={(e) => setXtreamUser(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="xt-pass">Password</Label>
                          <Input
                            id="xt-pass"
                            type="password"
                            placeholder="password"
                            value={xtreamPass}
                            onChange={(e) => setXtreamPass(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="pt-1">
                        <Label className="text-xs text-muted-foreground mb-2 block">Content to import</Label>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeLive}
                              onChange={(e) => setIncludeLive(e.target.checked)}
                              className="accent-primary rounded"
                            />
                            <span>Live TV</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeVod}
                              onChange={(e) => setIncludeVod(e.target.checked)}
                              className="accent-primary rounded"
                            />
                            <span>Movies (VOD)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeSeries}
                              onChange={(e) => setIncludeSeries(e.target.checked)}
                              className="accent-primary rounded"
                            />
                            <span>TV Series</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={startDemo}>
                    Try demo instead
                  </Button>
                  <Button onClick={addSource}>
                    Test & add
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-10 text-center"
              >
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                <h2 className="mt-6 text-2xl font-bold">Parsing your playlist</h2>
                <p className="mt-2 text-muted-foreground">
                  Running in a Web Worker so the UI never freezes.
                </p>
                <Progress value={progress} className="mt-6 h-2" />
                <p className="mt-2 text-sm text-muted-foreground">{Math.round(progress)}%</p>
              </motion.div>
            )}

            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.1 }}
                  className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary"
                >
                  <CheckCircle2 className="h-12 w-12" />
                </motion.div>
                <h2 className="text-3xl font-bold">You&apos;re ready</h2>
                <p className="mt-2 text-muted-foreground">
                  {channelCount.toLocaleString()} channels added.
                </p>
                <Button size="lg" className="mt-8 h-12 px-8 text-base" onClick={finish}>
                  Start watching
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function SourceOption({
  value,
  icon,
  title,
  desc,
  selected,
  badge,
}: {
  value: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  selected: boolean;
  badge?: string;
}) {
  return (
    <Label
      htmlFor={`src-${value}`}
      className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition ${
        selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "hover:bg-muted/50"
      }`}
    >
      <RadioGroupItem value={value} id={`src-${value}`} className="sr-only" />
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 font-semibold">
          {title}
          {badge && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <div
        className={`h-5 w-5 rounded-full border-2 ${
          selected ? "border-primary bg-primary" : "border-muted-foreground/40"
        }`}
      >
        {selected && <div className="m-auto mt-[2px] h-2 w-2 rounded-full bg-primary-foreground" />}
      </div>
    </Label>
  );
}
