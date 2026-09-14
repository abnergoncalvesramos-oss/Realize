// Instagram API with Instagram Login (Business Login for Instagram).
// Não exige Página do Facebook vinculada. Host da API: graph.instagram.com

const API = "https://graph.instagram.com";
const VERSION = "v23.0";

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
    response_type: "code",
    scope: IG_SCOPES,
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

type ShortToken = { access_token: string; user_id: string; permissions?: string };

// Passo 1: code -> token curto (1 hora)
export async function exchangeCode(code: string): Promise<ShortToken> {
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`exchangeCode: ${JSON.stringify(json)}`);
  // A resposta pode vir como objeto ou dentro de `data[]` dependendo do app.
  const t = Array.isArray(json.data) ? json.data[0] : json;
  return { access_token: t.access_token, user_id: String(t.user_id), permissions: t.permissions };
}

// Passo 2: token curto -> token longo (60 dias)
export async function exchangeLongLived(shortToken: string) {
  const p = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    access_token: shortToken,
  });
  const res = await fetch(`${API}/access_token?${p}`);
  const json = await res.json();
  if (!res.ok) throw new Error(`exchangeLongLived: ${JSON.stringify(json)}`);
  return { accessToken: json.access_token as string, expiresIn: json.expires_in as number };
}

// Renovação. Só funciona se o token tiver mais de 24h de vida e menos de 60 dias.
export async function refreshToken(longToken: string) {
  const p = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: longToken,
  });
  const res = await fetch(`${API}/refresh_access_token?${p}`);
  const json = await res.json();
  if (!res.ok) throw new Error(`refreshToken: ${JSON.stringify(json)}`);
  return { accessToken: json.access_token as string, expiresIn: json.expires_in as number };
}

export async function getProfile(token: string) {
  const p = new URLSearchParams({
    fields: "user_id,username,profile_picture_url",
    access_token: token,
  });
  const res = await fetch(`${API}/${VERSION}/me?${p}`);
  const json = await res.json();
  if (!res.ok) throw new Error(`getProfile: ${JSON.stringify(json)}`);
  return json as { user_id: string; username: string; profile_picture_url?: string };
}

type Media = { type: "image" | "video"; url: string };

// Publicação em duas etapas: cria o container, depois publica.
// A mídia PRECISA estar num URL público — a Meta faz download dela.
export async function publish(
  igUserId: string,
  token: string,
  media: Media[],
  caption: string,
): Promise<{ id: string; permalink?: string }> {
  if (media.length === 0) throw new Error("Sem mídia para publicar");

  let creationId: string;

  if (media.length === 1) {
    creationId = await createContainer(igUserId, token, {
      ...mediaFields(media[0]),
      caption,
    });
  } else {
    // Carrossel: um container por item, depois um container pai.
    const children: string[] = [];
    for (const m of media) {
      children.push(
        await createContainer(igUserId, token, {
          ...mediaFields(m),
          is_carousel_item: "true",
        }),
      );
    }
    creationId = await createContainer(igUserId, token, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
    });
  }

  await waitUntilReady(creationId, token);

  const res = await fetch(`${API}/${VERSION}/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`media_publish: ${JSON.stringify(json)}`);

  return { id: json.id, permalink: await permalinkOf(json.id, token) };
}

function mediaFields(m: Media): Record<string, string> {
  return m.type === "video"
    ? { media_type: "REELS", video_url: m.url }
    : { image_url: m.url };
}

async function createContainer(
  igUserId: string,
  token: string,
  fields: Record<string, string>,
): Promise<string> {
  const res = await fetch(`${API}/${VERSION}/${igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({ ...fields, access_token: token }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`create container: ${JSON.stringify(json)}`);
  return json.id as string;
}

// Vídeo demora a processar. Publicar antes de ficar FINISHED dá erro.
async function waitUntilReady(containerId: string, token: string, maxMs = 300_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const p = new URLSearchParams({ fields: "status_code,status", access_token: token });
    const res = await fetch(`${API}/${VERSION}/${containerId}?${p}`);
    const json = await res.json();
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      throw new Error(`Container ${json.status_code}: ${json.status ?? ""}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Container não ficou pronto a tempo");
}

async function permalinkOf(mediaId: string, token: string): Promise<string | undefined> {
  const p = new URLSearchParams({ fields: "permalink", access_token: token });
  const res = await fetch(`${API}/${VERSION}/${mediaId}?${p}`);
  if (!res.ok) return undefined;
  return (await res.json()).permalink;
}

// Quantos posts ainda cabem nas últimas 24h (o limite da Meta é 25).
export async function remainingQuota(igUserId: string, token: string): Promise<number> {
  const p = new URLSearchParams({ access_token: token });
  const res = await fetch(`${API}/${VERSION}/${igUserId}/content_publishing_limit?${p}`);
  if (!res.ok) return 25;
  const json = await res.json();
  const used = json?.data?.[0]?.quota_usage ?? 0;
  return Math.max(0, 25 - used);
}
