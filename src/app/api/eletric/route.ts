import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { listEletric } from "@/lib/sheets/eletric";

/** Só leitura - a aba Eletric é mantida manualmente na planilha, o app não cria/edita linhas. */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  return NextResponse.json(await listEletric());
}
