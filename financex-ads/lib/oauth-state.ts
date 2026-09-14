import crypto from "node:crypto";

// O state do OAuth carrega de quem é a conta que está sendo conectada.
// Assinado com HMAC para ninguém forjar um client_id e sequestrar a conexão.

export type OAuthState = {
  client_id: string | null; // null = conta da própria agência
  owner_id: string;
  nonce: string;
};

function sign(body: string): string {
  return crypto
    .createHmac("sha256", process.env.TOKEN_ENC_KEY!)
    .update(body)
    .digest("base64url");
}

export function signState(data: Omit<OAuthState, "nonce">): string {
  const payload: OAuthState = {
    ...data,
    nonce: crypto.randomBytes(16).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyState(state: string): OAuthState | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // timingSafeEqual explode se os tamanhos diferem, então checa antes
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}
