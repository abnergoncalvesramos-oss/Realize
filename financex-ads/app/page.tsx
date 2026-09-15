import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

const usd = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(n);

export default async function Painel() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS cuida do escopo: essas queries só devolvem o que é do afiliado logado.
  const [{ data: me }, { data: commissions }, { data: clicks }, { data: link }] =
    await Promise.all([
      supabase.from("affiliates").select("*, plans(name, max_accounts, posts_per_day)").single(),
      supabase.from("commissions").select("amount, status"),
      supabase.from("clicks").select("id", { count: "exact", head: true }),
      supabase.from("ref_links").select("slug").limit(1).maybeSingle(),
    ]);

  if (!me) {
    return (
      <section><div className="wrap">
        <h1>Assinatura pendente</h1>
        <p className="lede">Sua conta ainda não foi liberada. Assim que o pagamento for confirmado, o painel abre aqui.</p>
      </div></section>
    );
  }

  const paid = (commissions ?? []).filter(c => c.status === "paid")
    .reduce((s, c) => s + Number(c.amount), 0);
  const pending = (commissions ?? []).filter(c => c.status !== "paid" && c.status !== "canceled")
    .reduce((s, c) => s + Number(c.amount), 0);

  const url = link ? `${process.env.NEXT_PUBLIC_SHORT_URL}/r/${link.slug}` : null;

  return (
    <>
      <section>
        <div className="wrap">
          <h1>Olá, {me.display_name}</h1>
          <p className="lede">
            Plano {me.plans?.name} · {me.plans?.max_accounts ?? "contas ilimitadas"}
            {me.plans?.max_accounts ? " contas" : ""} · {me.plans?.posts_per_day} publicações por conta ao dia
          </p>

          <div className="grid3">
            <div className="met"><div className="v">{usd(pending)}</div><div className="k">A receber</div></div>
            <div className="met"><div className="v">{usd(paid)}</div><div className="k">Já pago</div></div>
            <div className="met"><div className="v">{clicks?.length ?? 0}</div><div className="k">Cliques no seu link</div></div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>Seu link</h2>
          <p className="lede">Use este endereço em todas as legendas e na bio. É por ele que a venda é ligada a você.</p>
          {url
            ? <div className="link-box">{url}</div>
            : <div className="empty">Seu link é gerado quando a assinatura é confirmada.</div>}
        </div>
      </section>
    </>
  );
}
