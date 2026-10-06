import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Channel } from "@/lib/iptv/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playlistId = searchParams.get("playlistId");

    if (!playlistId) {
      return NextResponse.json({ error: "Missing playlistId parameter" }, { status: 400 });
    }

    const channels = await db.channel.findMany({
      where: { playlistId },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(channels);
  } catch (err: unknown) {
    console.error("Failed to load channels from database:", err);
    return NextResponse.json({ error: "Failed to load channels" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playlistId, channels } = body as { playlistId: string; channels: Channel[] };

    if (!playlistId || !Array.isArray(channels)) {
      return NextResponse.json({ error: "playlistId and channels array are required" }, { status: 400 });
    }

    // Replace in a transaction: delete old, insert new in batches
    await db.$transaction(async (tx) => {
      await tx.channel.deleteMany({
        where: { playlistId },
      });

      const BATCH_SIZE = 500;
      for (let i = 0; i < channels.length; i += BATCH_SIZE) {
        const batch = channels.slice(i, i + BATCH_SIZE).map((c) => ({
          id: c.id,
          playlistId,
          number: c.number || null,
          name: c.name || "Untitled",
          logo: c.logo || null,
          group: c.group || "All Channels",
          tvgId: c.tvgId || null,
          tvgName: c.tvgName || null,
          url: c.url,
          catchup: c.catchup || null,
          catchupSource: c.catchupSource || null,
          userAgent: c.userAgent || null,
          referrer: c.referrer || null,
          hidden: Boolean(c.hidden),
          language: c.language || null,
          quality: c.quality || null,
        }));

        if (batch.length > 0) {
          await tx.channel.createMany({
            data: batch,
          });
        }
      }
    });

    return NextResponse.json({ success: true, count: channels.length });
  } catch (err: unknown) {
    console.error("Failed to save channels to database:", err);
    return NextResponse.json({ error: "Failed to save channels" }, { status: 500 });
  }
}
