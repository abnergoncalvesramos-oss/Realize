import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function Criativos() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A policy só devolve criativos ativos, e só para afiliado com assinatura em dia.
  const { data: creatives } = await supabase
    .from("creatives").select("id, title, kind, url, thumb_url, duration_s, tags")
    .order("created_at", { ascending: false });

  return (
    <section>
      <div className="wrap">
        <h1>Criativos</h1>
        <p className="lede">
          Baixe e publique. Variar o criativo entre as suas contas é o que mantém o alcance alto
          e evita bloqueio — o agendamento já faz isso sozinho.
        </p>

        {!creatives?.length ? (
          <div className="empty">Nenhum criativo disponível no momento.</div>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Título</th><th>Tipo</th><th className="num">Duração</th><th></th></tr></thead>
              <tbody>
                {creatives.map(c => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{c.kind}</td>
                    <td className="num">{c.duration_s ? `${c.duration_s}s` : "—"}</td>
                    <td className="num"><a className="btn ghost" href={c.url} download>Baixar</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
