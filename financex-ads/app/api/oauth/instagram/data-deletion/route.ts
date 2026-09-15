import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { parseSignedRequest } from "@/lib/signed-request";
import { createAdminClient } from "@/lib/supabase-admin";

// Pedido de exclusão de dados. A Meta exige que a resposta traga uma URL de
// acompanhamento e um código de confirmação.
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

  // accounts é pai de credentials e post_targets com on delete cascade,
  // então apagar a conta leva junto token e fila de publicação.
  if (account) await admin.from("accounts").delete().eq("id", account.id);

  const code = crypto.randomBytes(12).toString("hex");
  return NextResponse.json({
    url: `${process.env.APP_URL}/exclusao-de-dados?code=${code}`,
    confirmation_code: code,
  });
}
