import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const TABLES = [
  "pt_products",
  "pt_product_variants",
  "pt_orders",
  "pt_order_items",
  "pt_settings",
] as const;

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin not configured" },
      { status: 500 }
    );
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  const data: Record<string, unknown[]> = {};

  // Export all tables — page through .range() so we back up ALL rows (not just the
  // first 1000). A fetch error means a partial/broken backup, so fail loudly (500)
  // instead of silently uploading an incomplete snapshot.
  const PAGE = 1000;
  for (const table of TABLES) {
    try {
      const rows: unknown[] = [];
      for (let from = 0; from < 1_000_000; from += PAGE) {
        const { data: page, error } = await supabaseAdmin
          .from(table)
          .select("*")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        if (!page || page.length === 0) break;
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      data[table] = rows;
      counts[table] = rows.length;
    } catch (e) {
      console.error(`Error fetching ${table}:`, e);
      return NextResponse.json(
        { error: `Backup failed fetching ${table}`, details: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );
    }
  }

  const backup = {
    meta: {
      project: "playtime",
      date: today,
      timestamp: now.toISOString(),
      counts,
    },
    ...data,
  };

  const jsonBytes = Buffer.from(JSON.stringify(backup), "utf-8");

  // Upload to Supabase Storage
  const { error: storageErr } = await supabaseAdmin.storage
    .from("backups")
    .upload(`playtime-backup-${today}.json`, jsonBytes, {
      contentType: "application/json",
      upsert: true,
    });

  if (storageErr) {
    // Fail loudly so Vercel Cron marks the run as failed and alerts — a backup that
    // wasn't actually stored must NOT report success.
    console.error("Storage upload error:", storageErr);
    return NextResponse.json(
      { error: "Backup upload failed", details: storageErr.message },
      { status: 500 }
    );
  }

  // Clean old backups (keep last 30 days)
  try {
    const { data: files } = await supabaseAdmin.storage
      .from("backups")
      .list("", { limit: 200 });

    if (files && files.length > 30) {
      const sorted = files
        .filter((f) => f.name.startsWith("playtime-backup-"))
        .sort((a, b) => a.name.localeCompare(b.name));
      const toDelete = sorted.slice(0, sorted.length - 30).map((f) => f.name);
      if (toDelete.length > 0) {
        await supabaseAdmin.storage.from("backups").remove(toDelete);
      }
    }
  } catch (e) {
    console.error("Cleanup error:", e);
  }

  return NextResponse.json({
    ok: true,
    date: today,
    counts,
    storage: true,
  });
}
