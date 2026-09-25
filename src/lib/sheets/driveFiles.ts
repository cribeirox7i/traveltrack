import { callAppsScript } from "./client";

export const CATEGORIAS_ANEXO = [
  "traslado",
  "passagem",
  "alimentacao",
  "passeio",
  "hospedagem",
  "documentos",
  "outros",
] as const;

export type CategoriaAnexo = (typeof CATEGORIAS_ANEXO)[number];

export interface DriveFileInfo {
  fileId: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  categoria: string;
  criadoEm: string;
}

/** Varre a pasta da viagem no Drive direto (não lê nenhuma aba da planilha) - usado pelo
 * download offline ("Dados offline") pra saber quais arquivos existem e baixar todos, e por
 * qualquer tela que precise da lista bruta em vez de uma coleção específica (Anexos/Itens). */
export async function listDriveFiles(tripId: string, tripName: string): Promise<DriveFileInfo[]> {
  return callAppsScript<DriveFileInfo[]>("driveListFiles", { tripId, tripName });
}

export async function uploadDriveFile(input: {
  tripId: string;
  tripName: string;
  categoria: CategoriaAnexo;
  filename: string;
  mimeType: string;
  base64Data: string;
}): Promise<DriveFileInfo> {
  return callAppsScript<DriveFileInfo>("driveUploadFile", input);
}

/**
 * Exclusão e download exigem a viagem: o Apps Script confirma que o `fileId` está mesmo dentro
 * da pasta dessa viagem antes de agir. Sem isso, ter acesso a uma viagem qualquer bastava para
 * mexer em anexo de outra (ou em qualquer arquivo do Drive da conta) só sabendo o id.
 */
export async function deleteDriveFile(
  fileId: string,
  tripId: string,
  tripName: string
): Promise<void> {
  await callAppsScript<null>("driveDeleteFile", { fileId, tripId, tripName });
}

/** Move a pasta inteira de anexos da viagem pra lixeira do Drive - usado ao excluir a viagem. */
export async function deleteTripFolder(tripId: string, tripName: string): Promise<void> {
  await callAppsScript<null>("driveDeleteTripFolder", { tripId, tripName });
}

export async function downloadDriveFile(
  fileId: string,
  tripId: string,
  tripName: string
): Promise<{ name: string; mimeType: string; base64Data: string }> {
  return callAppsScript("driveDownloadFile", { fileId, tripId, tripName });
}
