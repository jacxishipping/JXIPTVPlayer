"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link2, Upload, Code2, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { getDb, replacePlaylistChannels } from "@/lib/iptv/db";
import { parseM3U } from "@/lib/iptv/m3u-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import type { Playlist, SourceType } from "@/lib/iptv/types";
import { useToast } from "@/hooks/use-toast";

export function AddSourceModal() {
  const { addSourceOpen, setAddSourceOpen, setPlaylists, setActivePlaylist, setChannels } = useIptv();
  const { toast } = useToast();
  const [sourceType, setSourceType] = useState<SourceType>("m3u-url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => {
    setAddSourceOpen(false);
    setSourceType("m3u-url");
    setName("");
    setUrl("");
    setText("");
    setFileName("");
    setProgress(0);
    setError(null);
    setLoading(false);
  };

  const onFile = useCallback(async (file: File) => {
    setFileName(file.name);
    const t = await file.text();
    setText(t);
    setName((n) => n || file.name.replace(/\.m3u8?$/i, ""));
  }, []);

  const add = useCallback(async () => {
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
    setLoading(true);
    setProgress(5);
    try {
      const db = getDb();
      const id = `pl_${Date.now().toString(36)}`;
      const pl: Playlist = {
        id,
        name: name.trim() || (sourceType === "m3u-url" ? new URL(url).hostname : "My Playlist"),
        type: sourceType,
        url: sourceType === "m3u-url" ? url.trim() : undefined,
        channelCount: 0,
        addedAt: Date.now(),
        lastRefreshedAt: Date.now(),
      };
      await db.playlists.put(pl);
      setProgress(20);
      let sourceText = "";
      if (sourceType === "m3u-url") {
        const res = await fetch(url.trim(), { mode: "cors" });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching playlist.`);
        sourceText = await res.text();
      } else {
        sourceText = text;
      }
      setProgress(45);
      const result = parseM3U(sourceText, id, (p) => {
        setProgress(45 + Math.min(40, (p / 200) * 40));
      });
      setProgress(85);
      await replacePlaylistChannels(id, result.channels);
      pl.channelCount = result.count;
      pl.lastRefreshedAt = Date.now();
      await db.playlists.put(pl);
      const all = await db.playlists.toArray();
      all.sort((a, b) => a.addedAt - b.addedAt);
      setPlaylists(all);
      setActivePlaylist(id);
      const channels = await db.channels.where("playlistId").equals(id).toArray();
      const groups = Array.from(new Set(channels.map((c) => c.group ?? "All"))).sort();
      setChannels(channels, groups);
      setProgress(100);
      toast({
        title: "Playlist added",
        description: `${result.count.toLocaleString()} channels imported.`,
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [sourceType, name, url, text, setPlaylists, setActivePlaylist, setChannels, toast]);

  return (
    <AnimatePresence>
      {addSourceOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl glass-strong rounded-2xl border shadow-2xl"
          >
            <div className="flex items-center justify-between p-5 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                <h2 className="font-semibold text-lg">Add a source</h2>
              </div>
              <button
                onClick={close}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <RadioGroup
                value={sourceType}
                onValueChange={(v) => setSourceType(v as SourceType)}
                className="grid grid-cols-3 gap-2"
              >
                {[
                  { v: "m3u-url", label: "URL", icon: Link2 },
                  { v: "m3u-file", label: "Upload", icon: Upload },
                  { v: "text", label: "Paste", icon: Code2 },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const sel = sourceType === opt.v;
                  return (
                    <Label
                      key={opt.v}
                      htmlFor={`asrc-${opt.v}`}
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-sm transition ${
                        sel ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      <RadioGroupItem value={opt.v} id={`asrc-${opt.v}`} className="sr-only" />
                      <Icon className="h-5 w-5" />
                      {opt.label}
                    </Label>
                  );
                })}
              </RadioGroup>

              <div>
                <Label htmlFor="asrc-name">Playlist name</Label>
                <Input
                  id="asrc-name"
                  placeholder="e.g. My Channels"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {sourceType === "m3u-url" && (
                <div>
                  <Label htmlFor="asrc-url">M3U / M3U8 URL</Label>
                  <Input
                    id="asrc-url"
                    placeholder="https://example.com/playlist.m3u8"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
              )}

              {sourceType === "m3u-file" && (
                <div>
                  <Label>File</Label>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-5 text-left transition hover:bg-muted"
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm">{fileName || "Choose an .m3u file"}</span>
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
                  <Label htmlFor="asrc-text">M3U content</Label>
                  <Textarea
                    id="asrc-text"
                    rows={6}
                    placeholder="#EXTM3U&#10;#EXTINF:-1,Channel Name&#10;https://..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {loading && (
                <div>
                  <Progress value={progress} className="h-2" />
                  <p className="mt-1 text-xs text-muted-foreground">{Math.round(progress)}%</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={close} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={add} disabled={loading || sourceType === "xtream"}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Add playlist
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
