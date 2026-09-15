import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/instagram";
import { signState } from "@/lib/oauth-state";
import { createAdminClient } from "@/lib/supabase-admin";

// Fluxo do cliente final (a clínica):
// você manda https://seuapp.com/c/<token> -> essa rota -> tela do Instagram
// -> callback grava a conta já amarrada ao client_id certo.
// A clínica nunca cria conta no seu sistema. Dois cliques e acabou.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("redeem_invite", {
    invite_token: token,
  });

  const invite = data?.[0];
  if (error || !invite) {
    return NextResponse.redirect(`${process.env.APP_URL}/convite-invalido`);
  }

  const state = signState({
    client_id: invite.client_id,
    owner_id: invite.owner_id,
  });

  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
