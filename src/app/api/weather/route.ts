import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { averageTemperatureForCity } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  const month = Number(searchParams.get("month"));
  const day = Number(searchParams.get("day"));
  if (!city || !month || !day) return errorResponse("Parâmetros inválidos");

  const tempC = await averageTemperatureForCity(city, month, day);
  return NextResponse.json({ tempC });
}
