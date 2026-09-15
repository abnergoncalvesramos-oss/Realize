import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; convite?: string }>;
}) {
  const { msg, convite } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clients } = await supabase
    .from("clients").select("id, name, slug, active")
    .order("created_at", { ascending: false });

  const linkConvite = convite ? `${process.env.APP_URL}/c/${convite}` : null;

  return (
    <section>
      <div className="wrap">
        <h1>Clientes</h1>
        <p className="lede">
          Cada cliente conecta o Instagram dele por um link. Ele não cria conta aqui,
          não precisa de Facebook e não vê nada além da tela de autorização.
        </p>

        {msg && <div className="card" style={{ marginBottom: 18 }}>{msg}</div>}

        {linkConvite && (
          <div className="card" style={{ marginBottom: 18 }}>
            <p style={{ marginBottom: 8 }}>
              <strong>Link pronto.</strong> Mande para o cliente. Vale 14 dias ou 5 usos.
            </p>
            <code style={{ wordBreak: "break-all", fontSize: 13 }}>{linkConvite}</code>
          </div>
        )}

        <div className="card" style={{ marginBottom: 18 }}>
          <form action="/api/clientes" method="post">
            <input
              name="nome"
              placeholder="Nome do cliente"
              required
              style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 4,
                       fontSize: 15, marginRight: 8, minWidth: 220 }}
            />
            <button className="btn" type="submit">Adicionar cliente</button>
          </form>
        </div>

        {!clients?.length ? (
          <div className="empty">
            Nenhum cliente ainda. Adicione o primeiro acima e gere o link de conexão.
          </div>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Cliente</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td><a href={`/clientes/${c.id}`}>{c.name}</a></td>
                    <td>{c.active ? "ativo" : "inativo"}</td>
                    <td className="num">
                      <form action={`/api/clientes/${c.id}/convite`} method="post">
                        <button className="btn ghost" type="submit">Gerar link</button>
                      </form>
                    </td>
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
