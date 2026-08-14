import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

export type ApiSession = Session;

export async function requireSession(): Promise<
  { session: ApiSession } | { error: NextResponse }
> {
  const session: Session | null = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  return { session };
}

export async function requireAdmin(): Promise<
  { session: ApiSession } | { error: NextResponse }
> {
  const result = await requireSession();
  if ("error" in result) return result;
  if (result.session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "Acesso restrito ao admin" }, { status: 403 }) };
  }
  return result;
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
