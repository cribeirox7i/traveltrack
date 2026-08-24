"use client";

import { useEffect, useRef, useState } from "react";
import { getLocalTripImage, useOnlineStatus } from "@/lib/offline/useOfflineData";
import { saveLastTripImage } from "@/lib/offline/sync";
import { CityImage, findCityImage } from "@/lib/wikipedia";

interface TripDayCities {
  origem: string;
  destino: string;
  pernoite: string;
  origem_pais: string;
  destino_pais: string;
  pernoite_pais: string;
}

const ROTATE_MS = 9000;

/** Cidades distintas do roteiro (Origem/Destino/Pernoite de todos os dias), com o país que foi
 * capturado junto na hora da escolha no autocomplete (ver Itinerário) - repetições e campos
 * vazios descartados. Limitado a 10 pra não disparar buscas demais numa viagem muito longa. */
function distinctCities(days: TripDayCities[]): { cidade: string; pais: string }[] {
  const vistos = new Map<string, { cidade: string; pais: string }>();
  for (const day of days) {
    const candidatos: [string, string][] = [
      [day.origem, day.origem_pais],
      [day.destino, day.destino_pais],
      [day.pernoite, day.pernoite_pais],
    ];
    for (const [cidade, pais] of candidatos) {
      const nome = cidade?.trim();
      if (!nome) continue;
      const chave = nome.toLowerCase();
      if (!vistos.has(chave)) vistos.set(chave, { cidade: nome, pais: pais?.trim() ?? "" });
    }
  }
  return Array.from(vistos.values()).slice(0, 10);
}

/**
 * Banner giratório com uma foto ilustrativa por cidade do roteiro (Wikipedia em português, sem
 * chave - ver lib/wikipedia.ts), trocando de foto sozinho a cada alguns segundos. A cada troca,
 * enquanto online, a foto atual é baixada e salva como "a última mostrada" (não o álbum inteiro)
 * - é isso que aparece, parado, quando a tela abre sem sinal.
 */
export function TripHeroImage({ tripId, days }: { tripId: string; days: TripDayCities[] }) {
  const online = useOnlineStatus();
  const [images, setImages] = useState<CityImage[]>([]);
  const [index, setIndex] = useState(0);
  const [offlineImage, setOfflineImage] = useState<{
    url: string;
    cidade: string;
    pageUrl: string;
  } | null>(null);
  const cidadesKey = distinctCities(days)
    .map((c) => `${c.cidade}|${c.pais}`)
    .join(",");

  // Busca as fotos das cidades do roteiro, uma vez por conjunto de cidades (não a cada
  // re-render) - refeito só se o roteiro mudar (cidade nova/removida no Itinerário).
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const cidades = distinctCities(days);
    (async () => {
      const resultados = await Promise.all(cidades.map((c) => findCityImage(c.cidade, c.pais)));
      if (cancelled) return;
      setImages(resultados.filter((r): r is CityImage => r !== null));
      setIndex(0);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, cidadesKey]);

  // Sem sinal (ou sem nenhuma foto resolvida ainda): cai pra última salva localmente.
  useEffect(() => {
    if (online && images.length > 0) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      const local = await getLocalTripImage(tripId);
      if (cancelled || !local) return;
      createdUrl = local.url;
      setOfflineImage(local);
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [online, images.length, tripId]);

  // Gira a cada ROTATE_MS entre as fotos já resolvidas.
  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [images.length]);

  // A cada troca de foto, salva a atual como "a última mostrada" - sobrescreve a anterior, é só
  // essa uma que precisa sobreviver offline, não o álbum inteiro. `blobCacheRef` garante que cada
  // foto só é baixada da Wikimedia uma vez por sessão nesta tela - sem isso, a rotação voltando
  // pras mesmas poucas fotos (A→B→A→B→...) rebaixava o arquivo de novo a cada 9s, sem motivo.
  const lastSavedRef = useRef<string | null>(null);
  const blobCacheRef = useRef<Map<string, Blob>>(new Map());
  useEffect(() => {
    const atual = images[index];
    if (!online || !atual || lastSavedRef.current === atual.imageUrl) return;
    lastSavedRef.current = atual.imageUrl;
    void saveLastTripImage(tripId, atual.cidade, atual.imageUrl, atual.pageUrl, blobCacheRef.current);
  }, [online, images, index, tripId]);

  const atual = online ? images[index] : null;
  const mostrar = atual
    ? { url: atual.imageUrl, cidade: atual.cidade, pageUrl: atual.pageUrl }
    : offlineImage;

  if (!mostrar) return null;

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-2xl sm:h-56">
      {/* eslint-disable-next-line @next/next/no-img-element -- fonte externa (Wikipedia), sem
          domínio fixo pra configurar em next/image, e o volume aqui é baixo (poucas fotos por
          viagem, trocando devagar). */}
      <img
        key={mostrar.url}
        src={mostrar.url}
        alt={mostrar.cidade}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-xs text-white">
        <span className="font-medium">{mostrar.cidade}</span>
        <div className="flex items-center gap-2">
          {!online && <span className="opacity-80">offline</span>}
          <a
            href={mostrar.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-80 hover:underline"
          >
            Wikipedia
          </a>
        </div>
      </div>
    </div>
  );
}
