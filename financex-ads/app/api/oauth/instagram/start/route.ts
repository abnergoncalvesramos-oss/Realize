import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/instagram";
import { signState } from "@/lib/oauth-state";
import { createClient } from "@/lib/supabase-server";

// Conexão iniciada por você, logado no painel.
// ?client_id=<uuid> amarra a conta a um cliente da carteira.
// Sem o parâmetro, a conta fica na própria agência.
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.APP_URL!));

  const clientId = new URL(req.url).searchParams.get("client_id");

  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();
    if (!client) {
      return NextResponse.redirect(`${process.env.APP_URL}/clientes?msg=Cliente+inexistente`);
    }
  }

  const state = signState({ client_id: clientId, owner_id: user.id });

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
