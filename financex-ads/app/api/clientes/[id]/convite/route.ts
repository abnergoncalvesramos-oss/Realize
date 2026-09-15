import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase-server";

// Gera o link que o cliente abre para conectar o Instagram dele.
// Ele não cria conta aqui: abre o link, autoriza na Meta e acabou.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.APP_URL}/login`);

  const token = crypto.randomBytes(24).toString("base64url");

  // own_invites só deixa inserir em client_id que pertence a quem está logado.
  const { error } = await supabase.from("connect_invites").insert({
    client_id: id,
    token,
    platforms: ["instagram"],
  });

  if (error) {
    return NextResponse.redirect(
      `${process.env.APP_URL}/clientes?msg=${encodeURIComponent("Não foi possível gerar o convite")}`,
      { status: 303 },
    );
  }

  return NextResponse.redirect(
    `${process.env.APP_URL}/clientes?convite=${token}`,
    { status: 303 },
  );
}
