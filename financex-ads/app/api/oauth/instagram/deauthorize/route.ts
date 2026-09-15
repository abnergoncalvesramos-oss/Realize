import { NextRequest, NextResponse } from "next/server";
import { parseSignedRequest } from "@/lib/signed-request";
import { createAdminClient } from "@/lib/supabase-admin";

// A pessoa removeu o app pelo Instagram. A Meta avisa aqui.
// Marca a conta como revogada e joga fora o token: ele já não vale mais.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parsed = parseSignedRequest(String(form.get("signed_request") ?? ""));
  if (!parsed?.user_id) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("accounts").select("id")
    .eq("platform", "instagram").eq("external_id", parsed.user_id)
    .maybeSingle();

  if (account) {
    await admin.from("credentials").delete().eq("account_id", account.id);
    await admin.from("accounts")
      .update({ status: "revoked", last_error: "Acesso removido pelo usuário no Instagram" })
      .eq("id", account.id);
  }

  return NextResponse.json({ ok: true });
}
