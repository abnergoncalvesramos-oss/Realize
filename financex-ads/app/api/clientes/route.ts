import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

function slugify(nome: string): string {
  return nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 40);
}

// Cria um cliente. Vem de um <form> comum, então responde com redirect.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.APP_URL}/login`);

  const form = await req.formData();
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) {
    return NextResponse.redirect(`${process.env.APP_URL}/clientes?msg=Informe+o+nome`);
  }

  // A policy own_clients cuida do owner_id; unique (owner_id, slug) evita repetido.
  const { error } = await supabase
    .from("clients")
    .insert({ owner_id: user.id, name: nome, slug: slugify(nome) });

  const msg = error
    ? (error.code === "23505" ? "Já existe um cliente com esse nome" : "Não foi possível criar")
    : `${nome} criado`;

  return NextResponse.redirect(
    `${process.env.APP_URL}/clientes?msg=${encodeURIComponent(msg)}`,
    { status: 303 },
  );
}
