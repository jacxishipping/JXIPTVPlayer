import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/iptv/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s = await db.settings.findUnique({
      where: { id: "settings" },
    });
    return NextResponse.json({ ...DEFAULT_SETTINGS, ...(s || {}) });
  } catch (err: unknown) {
    console.error("Failed to load settings:", err);
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function POST(req: NextRequest) {
  try {
    const patch = await req.json();
    const current = await db.settings.findUnique({ where: { id: "settings" } });
    const merged = { ...DEFAULT_SETTINGS, ...(current || {}), ...patch, id: "settings" };

    const s = await db.settings.upsert({
      where: { id: "settings" },
      create: merged,
      update: merged,
    });

    return NextResponse.json(s);
  } catch (err: unknown) {
    console.error("Failed to save settings:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
