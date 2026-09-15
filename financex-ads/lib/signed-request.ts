import crypto from "node:crypto";

// A Meta chama os callbacks de desautorização e exclusão com um signed_request:
// "<assinatura base64url>.<payload base64url>", assinado com o app secret.
// Sem conferir a assinatura, qualquer um poderia desconectar contas alheias.

export type SignedRequest = { user_id?: string; algorithm?: string };

export function parseSignedRequest(signed: string): SignedRequest | null {
  const [encodedSig, payload] = signed.split(".");
  if (!encodedSig || !payload) return null;

  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret) return null;

  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const sig = Buffer.from(encodedSig, "base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}
