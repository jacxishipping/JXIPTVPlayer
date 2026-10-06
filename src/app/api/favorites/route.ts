import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const fav = await db.favorite.findUnique({
      where: { id: "default" },
    });
    const channelIds: string[] = fav ? JSON.parse(fav.channelIds || "[]") : [];
    return NextResponse.json({ id: "default", channelIds });
  } catch (err: unknown) {
    console.error("Failed to load favorites:", err);
    return NextResponse.json({ id: "default", channelIds: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { channelIds } = await req.json();
    const ids = Array.isArray(channelIds) ? channelIds : [];

    await db.favorite.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        channelIds: JSON.stringify(ids),
      },
      update: {
        channelIds: JSON.stringify(ids),
      },
    });

    return NextResponse.json({ success: true, channelIds: ids });
  } catch (err: unknown) {
    console.error("Failed to save favorites:", err);
    return NextResponse.json({ error: "Failed to save favorites" }, { status: 500 });
  }
}
