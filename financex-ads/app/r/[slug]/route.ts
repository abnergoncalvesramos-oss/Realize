import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase-admin";

// O link do afiliado: financex.app/r/k7m2q9
// Grava o clique, planta o cookie de visitante e redireciona.
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("ref_links")
    .select("id, affiliate_id, destination")
    .eq("slug", params.slug)
    .maybeSingle();

  // Link inexistente vai pro site normal. Nunca mostre erro pro comprador.
  if (!link) {
    return NextResponse.redirect(process.env.DEFAULT_DESTINATION!);
  }

  // visitor_id é o que costura clique e venda depois.
  let visitorId = req.cookies.get("fx_vid")?.value;
  const isNew = !visitorId;
  if (!visitorId) visitorId = crypto.randomUUID();

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  await admin.from("clicks").insert({
    ref_link_id: link.id,
    affiliate_id: link.affiliate_id,
    visitor_id: visitorId,
    // Nunca guarde IP cru. O hash serve pra antifraude e não identifica ninguém.
    ip_hash: ip
      ? crypto.createHmac("sha256", process.env.TOKEN_ENC_KEY!).update(ip).digest("hex").slice(0, 32)
      : null,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    country: req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? null,
    utm: Object.fromEntries(new URL(req.url).searchParams),
  });

  const dest = new URL(link.destination);
  dest.searchParams.set("fx_vid", visitorId);

  const res = NextResponse.redirect(dest.toString(), 302);
  if (isNew) {
    res.cookies.set("fx_vid", visitorId, {
      httpOnly: false,      // o checkout precisa ler pra mandar no pedido
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,   // 30 dias, igual à janela de atribuição
      path: "/",
    });
  }
  return res;
}
