/**
 * Bloqueio de tela por biometria (Face ID / Touch ID / digital) via WebAuthn - puramente local,
 * por aparelho. Nao e login: a sessao (NextAuth/JWT) continua sendo a fonte de verdade de "quem
 * e" o usuario; isto so tranca a TELA enquanto ela ja esta autenticada. Por isso nao tem
 * round-trip de servidor: registra uma credencial de plataforma no aparelho (`create`) e depois
 * so confere que uma nova assinatura (`get`) sai com sucesso.
 *
 * Guardado em localStorage (por aparelho):
 * - `tt.bioLock`: "1" quando ativado.
 * - `tt.bioCredId`: id da credencial (base64url), pra pedir a MESMA na hora de desbloquear.
 */

const ENABLED_KEY = "tt.bioLock";
const CRED_ID_KEY = "tt.bioCredId";
const RP_NAME = "TravelTrack";

function rpId(): string {
  return window.location.hostname;
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function randomBytes(n: number): BufferSource {
  const arr = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(arr);
  return arr;
}

/** false em SSR/build (sem `window`) e em navegador sem WebAuthn. */
export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isBiometricLockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "1" && !!localStorage.getItem(CRED_ID_KEY);
  } catch {
    return false;
  }
}

/** Dispara o prompt biometrico do sistema pra registrar a credencial de plataforma. */
export async function enableBiometricLock(label: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: RP_NAME, id: rpId() },
        user: { id: randomBytes(16), name: label || "TravelTrack", displayName: label || "TravelTrack" },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256
          { type: "public-key", alg: -257 },  // RS256
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: "Cancelado." };
    localStorage.setItem(CRED_ID_KEY, toBase64Url(cred.rawId));
    localStorage.setItem(ENABLED_KEY, "1");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error && e.name === "NotAllowedError" ? "Cancelado." : "Nao foi possivel ativar.",
    };
  }
}

export function disableBiometricLock(): void {
  try {
    localStorage.removeItem(ENABLED_KEY);
    localStorage.removeItem(CRED_ID_KEY);
  } catch {}
}

/** Pede a confirmacao biometrica. `true` so quando o sensor confirma com sucesso. */
export async function verifyBiometric(): Promise<boolean> {
  try {
    const credIdRaw = localStorage.getItem(CRED_ID_KEY);
    if (!credIdRaw) return false;
    const assertion = await navigator.credentials.get({
      publicKey: {
        rpId: rpId(),
        challenge: randomBytes(32),
        allowCredentials: [{ id: fromBase64Url(credIdRaw), type: "public-key", transports: ["internal"] }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
