import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// Roda uma vez por dia. Gera os posts das próximas 24h de todo plano ativo.
// Idempotente: rodar duas vezes não duplica nada.
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: plans, error } = await admin
    .from("content_plans")
    .select("id, name, affiliate_id")
    .eq("active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Record<string, number | string> = {};

  for (const plan of plans ?? []) {
    const { data, error: e } = await admin.rpc("materialize_plan", {
      p_plan_id: plan.id,
    });
    // Um plano quebrado não pode derrubar os outros.
    results[plan.id] = e ? `erro: ${e.message}` : (data ?? 0);
  }

  const total = Object.values(results)
    .filter((v) => typeof v === "number")
    .reduce((s: number, v) => s + (v as number), 0);

  return NextResponse.json({ plans: plans?.length ?? 0, posts: total, results });
}
