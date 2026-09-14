import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase-admin";

// Chamado pelo gateway quando uma venda é aprovada.
// Espera: { order_id, amount, visitor_id, email }
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Assinatura HMAC. Sem isso qualquer um forja venda e saca comissão.
  const sent = req.headers.get("x-signature") ?? "";
  const expected = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET!)
    .update(raw)
    .digest("hex");
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const { order_id, amount, visitor_id, email } = body;
  if (!order_id || typeof amount !== "number") {
    return NextResponse.json({ error: "order_id e amount obrigatórios" }, { status: 400 });
  }

  // Sem visitor_id é venda orgânica: responde 200 pro gateway parar de reenviar.
  if (!visitor_id) {
    return NextResponse.json({ attributed: false, reason: "sem clique" });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("attribute_sale", {
    p_visitor_id: visitor_id,
    p_order_id: String(order_id),
    p_amount: amount,
    p_email: email ?? null,
  });

  if (error) {
    console.error("[webhook venda]", error);
    return NextResponse.json({ error: "falha ao atribuir" }, { status: 500 });
  }

  // data null = fora da janela de 30 dias, ou webhook repetido. Os dois são 200.
  return NextResponse.json({ attributed: Boolean(data), conversion_id: data });
}
