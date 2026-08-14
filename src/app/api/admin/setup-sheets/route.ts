import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { ensureSheetsStructure } from "@/lib/sheets/setup";

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const created = await ensureSheetsStructure();
  return NextResponse.json({ ok: true, abasCriadas: created });
}
