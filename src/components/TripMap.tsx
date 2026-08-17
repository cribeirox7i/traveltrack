"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface RoutePoint {
  key: string;
  label: string;
  sublabel: string;
  lat: number;
  lon: number;
}

/** Ícone via divIcon (HTML/SVG puro) em vez do ícone padrão do Leaflet — evita o problema clássico
 * de bundler que quebra o caminho das imagens padrão do pacote. */
function markerIcon(numero: number) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#0f172a;color:#fff;font:600 11px sans-serif;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${numero}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function FitBounds({ points }: { points: RoutePoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 10);
      return;
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lon] as [number, number]),
      { padding: [32, 32] }
    );
  }, [map, points]);

  return null;
}

export default function TripMap({ points }: { points: RoutePoint[] }) {
  const center: [number, number] = points.length
    ? [points[0].lat, points[0].lon]
    : [-15.78, -47.93]; // Brasília, só como centro inicial neutro antes de ter pontos

  return (
    <MapContainer center={center} zoom={4} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.length > 1 && (
        <Polyline positions={points.map((p) => [p.lat, p.lon])} pathOptions={{ color: "#2563eb", weight: 3 }} />
      )}
      {points.map((p, i) => (
        <Marker key={p.key} position={[p.lat, p.lon]} icon={markerIcon(i + 1)}>
          <Popup>
            <strong>{p.label}</strong>
            <br />
            {p.sublabel}
          </Popup>
        </Marker>
      ))}
      <FitBounds points={points} />
    </MapContainer>
  );
}
