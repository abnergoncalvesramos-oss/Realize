import { createClient } from "@/lib/supabase-server";

// Página de chegada depois de conectar pelo link de convite. O cliente final não
// tem login aqui, então ela precisa funcionar sem sessão: mostra só a confirmação.
// Quem estiver logado como dono vê o detalhe — é a RLS que decide, não esta página.
export default async function ClienteDetalhe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;

  const supabase = await createClient();

  // Sem sessão, ou logado como outro dono, a policy own_clients devolve vazio.
  const { data: client } = await supabase
    .from("clients").select("id, name").eq("id", id).maybeSingle();

  const { data: accounts } = client
    ? await supabase
        .from("accounts").select("id, platform, handle, status")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
    : { data: null };

  return (
    <section>
      <div className="wrap" style={{ maxWidth: 640 }}>
        <h1>{client?.name ?? "Tudo certo"}</h1>

        {msg && <div className="card" style={{ marginBottom: 18 }}>{msg}</div>}

        {!client ? (
          <p className="lede">
            A conta foi conectada. Pode fechar esta página — quem te enviou o convite
            já consegue publicar por ela.
          </p>
        ) : !accounts?.length ? (
          <div className="empty">Nenhuma conta conectada para este cliente ainda.</div>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Conta</th><th>Plataforma</th><th>Status</th></tr></thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}>
                    <td>{a.handle ? `@${a.handle}` : "—"}</td>
                    <td>{a.platform}</td>
                    <td>{a.status}</td>
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
