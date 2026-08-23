import { callAppsScript } from "./client";

export const CATEGORIAS_ANEXO = [
  "traslado",
  "passagem",
  "alimentacao",
  "passeio",
  "hospedagem",
  "outros",
] as const;

export type CategoriaAnexo = (typeof CATEGORIAS_ANEXO)[number];

export interface AnexoInfo {
  fileId: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  categoria: string;
  criadoEm: string;
}

export async function listAnexos(tripId: string, tripName: string): Promise<AnexoInfo[]> {
  return callAppsScript<AnexoInfo[]>("driveListFiles", { tripId, tripName });
}

export async function uploadAnexo(input: {
  tripId: string;
  tripName: string;
  categoria: CategoriaAnexo;
  filename: string;
  mimeType: string;
  base64Data: string;
}): Promise<AnexoInfo> {
  return callAppsScript<AnexoInfo>("driveUploadFile", input);
}

export async function deleteAnexo(fileId: string): Promise<void> {
  await callAppsScript<null>("driveDeleteFile", { fileId });
}

/** Move a pasta inteira de anexos da viagem pra lixeira do Drive — usado ao excluir a viagem. */
export async function deleteTripFolder(tripId: string, tripName: string): Promise<void> {
  await callAppsScript<null>("driveDeleteTripFolder", { tripId, tripName });
}

export async function downloadAnexo(
  fileId: string
): Promise<{ name: string; mimeType: string; base64Data: string }> {
  return callAppsScript("driveDownloadFile", { fileId });
}
