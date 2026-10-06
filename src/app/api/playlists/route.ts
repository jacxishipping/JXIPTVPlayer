import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const playlists = await db.playlist.findMany({
      orderBy: { addedAt: "asc" },
    });
    return NextResponse.json(playlists);
  } catch (err: unknown) {
    console.error("Failed to load playlists from database:", err);
    return NextResponse.json({ error: "Failed to load playlists" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, type, url, credentials, channelCount, addedAt, lastRefreshedAt, autoRefresh } = body;

    if (!id || !name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const playlist = await db.playlist.upsert({
      where: { id },
      create: {
        id,
        name,
        type: type || "m3u-url",
        url: url || null,
        credentials: credentials || null,
        channelCount: channelCount || 0,
        addedAt: addedAt || Date.now(),
        lastRefreshedAt: lastRefreshedAt || Date.now(),
        autoRefresh: autoRefresh || null,
      },
      update: {
        name,
        type: type || "m3u-url",
        url: url || null,
        credentials: credentials || null,
        channelCount: channelCount !== undefined ? channelCount : undefined,
        lastRefreshedAt: lastRefreshedAt || Date.now(),
        autoRefresh: autoRefresh || null,
      },
    });

    return NextResponse.json(playlist);
  } catch (err: unknown) {
    console.error("Failed to save playlist to database:", err);
    return NextResponse.json({ error: "Failed to save playlist" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    if (id === "all") {
      await db.channel.deleteMany({});
      await db.playlist.deleteMany({});
      await db.historyEntry.deleteMany({});
      return NextResponse.json({ success: true });
    }

    await db.playlist.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Failed to delete playlist:", err);
    return NextResponse.json({ error: "Failed to delete playlist" }, { status: 500 });
  }
}
