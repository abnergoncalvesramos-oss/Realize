import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, exchangeLongLived, getProfile } from "@/lib/instagram";
import { encrypt } from "@/lib/crypto";
import { verifyState } from "@/lib/oauth-state";
import { createAdminClient } from "@/lib/supabase-admin";

function back(msg: string, clientId?: string | null) {
  const path = clientId ? `/clientes/${clientId}` : "/contas";
  return NextResponse.redirect(
    `${process.env.APP_URL}${path}?msg=${encodeURIComponent(msg)}`,
  );
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (url.searchParams.get("error")) return back("Conexão cancelada");
  if (!code || !state) return back("Retorno inválido do Instagram");

  // Duas checagens: o state tem que bater com o cookie (CSRF) e a
  // assinatura tem que ser válida (ninguém trocou o client_id na URL).
  if (state !== req.cookies.get("ig_oauth_state")?.value) {
    return back("State inválido, tente de novo");
  }

  const parsed = verifyState(state);
  if (!parsed) return back("Assinatura do state inválida");

  const { client_id, owner_id } = parsed;

  try {
    const short = await exchangeCode(code);
    const long = await exchangeLongLived(short.access_token);
    const profile = await getProfile(long.accessToken);

    const admin = createAdminClient();

    // Se veio por link de convite, confere que o cliente é mesmo do dono
    // declarado no state. Defesa contra state de outro tenant.
    if (client_id) {
      const { data: client } = await admin
        .from("clients")
        .select("id")
        .eq("id", client_id)
        .eq("owner_id", owner_id)
        .maybeSingle();
      if (!client) return back("Cliente não encontrado");
    }

    const { data: account, error: accErr } = await admin
      .from("accounts")
      .upsert(
        {
          owner_id,
          client_id,
          platform: "instagram",
          kind: "organic",
          external_id: profile.user_id,
          handle: profile.username,
          avatar_url: profile.profile_picture_url ?? null,
          status: "connected",
          last_error: null,
        },
        { onConflict: "client_id,platform,external_id" },
      )
      .select("id")
      .single();
    if (accErr) throw accErr;

    const { error: credErr } = await admin.from("credentials").upsert({
      account_id: account.id,
      access_token_enc: encrypt(long.accessToken),
      refresh_token_enc: null,
      expires_at: new Date(Date.now() + long.expiresIn * 1000).toISOString(),
      scopes: (short.permissions ?? "").split(",").filter(Boolean),
    });
    if (credErr) throw credErr;

    const res = back("@" + profile.username + " conectado", client_id);
    res.cookies.delete("ig_oauth_state");
    return res;
  } catch (e) {
    console.error("[ig callback]", e);
    return back("Falha ao conectar, confira os logs", client_id);
  }
}
