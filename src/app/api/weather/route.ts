import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { weatherForCity } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  const date = searchParams.get("date");
  if (!city || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return errorResponse("Parâmetros inválidos");
  }

  const weather = await weatherForCity(city, date);
  return NextResponse.json({ weather });
}
