// Worker da fila. Roda como Background Worker no Render.
// Start: node --loader tsx worker/publish.ts   (ou compile para JS antes)

import { createAdminClient } from "../lib/supabase-admin";
import { encrypt, decrypt } from "../lib/crypto";
import * as ig from "../lib/instagram";

const db = createAdminClient();

const BATCH = 10;
const MAX_ATTEMPTS = 3;

// 1min, 5min, 25min
const backoffMs = (attempt: number) => 60_000 * Math.pow(5, attempt - 1);

async function tokenFor(accountId: string): Promise<string> {
  const { data, error } = await db
    .from("credentials")
    .select("access_token_enc, expires_at")
    .eq("account_id", accountId)
    .single();
  if (error || !data) throw new Error("Conta sem credencial");

  let token = decrypt(data.access_token_enc);

  // Renova com folga de 7 dias. O IG só deixa renovar token com +24h de vida.
  const expires = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expires && expires - Date.now() < 7 * 864e5) {
    const fresh = await ig.refreshToken(token);
    token = fresh.accessToken;
    await db
      .from("credentials")
      .update({
        access_token_enc: encrypt(token),
        expires_at: new Date(Date.now() + fresh.expiresIn * 1000).toISOString(),
      })
      .eq("account_id", accountId);
  }

  return token;
}

async function handle(target: any) {
  const { data: post } = await db
    .from("posts")
    .select("caption, media")
    .eq("id", target.post_id)
    .single();

  const { data: account } = await db
    .from("accounts")
    .select("platform, external_id")
    .eq("id", target.account_id)
    .single();

  if (!post || !account) throw new Error("Post ou conta sumiu");

  const token = await tokenFor(target.account_id);

  if (account.platform !== "instagram") {
    // Cada plataforma nova entra como um caso aqui.
    throw new Error(`Adaptador de ${account.platform} ainda não implementado`);
  }

  const quota = await ig.remainingQuota(account.external_id, token);
  if (quota <= 0) {
    // Não é erro: espera a janela de 24h abrir de novo.
    await db
      .from("post_targets")
      .update({
        status: "pending",
        attempts: Math.max(0, target.attempts - 1),
        next_retry_at: new Date(Date.now() + 3600_000).toISOString(),
        last_error: "Cota diária de 25 posts esgotada",
      })
      .eq("id", target.id);
    return;
  }

  const published = await ig.publish(
    account.external_id,
    token,
    post.media ?? [],
    post.caption ?? "",
  );

  await db
    .from("post_targets")
    .update({
      status: "done",
      external_id: published.id,
      permalink: published.permalink ?? null,
      published_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", target.id);
}

async function fail(target: any, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const giveUp = target.attempts >= MAX_ATTEMPTS;

  await db
    .from("post_targets")
    .update({
      status: giveUp ? "failed" : "pending",
      next_retry_at: giveUp
        ? null
        : new Date(Date.now() + backoffMs(target.attempts)).toISOString(),
      last_error: msg.slice(0, 500),
    })
    .eq("id", target.id);

  console.error(`[target ${target.id}] tentativa ${target.attempts}: ${msg}`);
}

// Fecha o post quando todos os alvos terminaram.
async function settle(postId: string) {
  const { data: targets } = await db
    .from("post_targets")
    .select("status")
    .eq("post_id", postId);
  if (!targets?.length) return;

  const open = targets.some((t) => t.status === "pending" || t.status === "processing");
  if (open) return;

  const ok = targets.filter((t) => t.status === "done").length;
  const status = ok === targets.length ? "done" : ok === 0 ? "failed" : "partial";
  await db.from("posts").update({ status }).eq("id", postId);
}

export async function tick() {
  const { data: targets, error } = await db.rpc("claim_targets", { batch_size: BATCH });
  if (error) {
    console.error("[claim]", error.message);
    return;
  }
  if (!targets?.length) return;

  const posts = new Set<string>();

  await Promise.allSettled(
    targets.map(async (t: any) => {
      posts.add(t.post_id);
      try {
        await handle(t);
      } catch (e) {
        await fail(t, e);
      }
    }),
  );

  for (const id of posts) await settle(id);
}

// Usado pelo endpoint /stats para você olhar a fila sem abrir o banco.
export async function queueStats() {
  const { data } = await db
    .from("post_targets")
    .select("status")
    .in("status", ["pending", "processing", "failed"]);

  const count = (s: string) => data?.filter((t) => t.status === s).length ?? 0;

  return {
    pending: count("pending"),
    processing: count("processing"),
    failed: count("failed"),
  };
}
