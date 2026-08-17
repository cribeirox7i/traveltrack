import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { ensureSheetsStructure } from "@/lib/sheets/setup";

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const result = await ensureSheetsStructure();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao verificar planilha" },
      { status: 500 }
    );
  }
}
