import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTrip, userCanAccessTrip } from "@/lib/sheets/trips";
import { TripTabs } from "@/components/TripTabs";

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const allowed = await userCanAccessTrip(session.user.id, session.user.role, id);
  if (!allowed) redirect("/trips");

  const trip = await getTrip(id);
  if (!trip) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{trip.nome}</h1>
        <p className="text-xs text-slate-500">
          {trip.data_inicio} — {trip.data_fim} · {trip.qtd_pessoas} pessoa(s)
        </p>
      </div>
      <TripTabs tripId={id} />
      {children}
    </div>
  );
}
