import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await db.historyEntry.findMany({
      orderBy: { watchedAt: "desc" },
      take: 50,
    });
    return NextResponse.json(history);
  } catch (err: unknown) {
    console.error("Failed to load history:", err);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const entry = await req.json();
    const { id, playlistId, channelName, channelLogo, watchedAt, position, duration } = entry;

    if (!id || !playlistId) {
      return NextResponse.json({ error: "id and playlistId required" }, { status: 400 });
    }

    const saved = await db.historyEntry.upsert({
      where: { id },
      create: {
        id,
        playlistId,
        channelName: channelName || "Untitled",
        channelLogo: channelLogo || null,
        watchedAt: watchedAt || Date.now(),
        position: position || null,
        duration: duration || null,
      },
      update: {
        channelName: channelName || undefined,
        channelLogo: channelLogo || undefined,
        watchedAt: watchedAt || Date.now(),
        position: position || undefined,
        duration: duration || undefined,
      },
    });

    return NextResponse.json(saved);
  } catch (err: unknown) {
    console.error("Failed to save history:", err);
    return NextResponse.json({ error: "Failed to save history" }, { status: 500 });
  }
}
