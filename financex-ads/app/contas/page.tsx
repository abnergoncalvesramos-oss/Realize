import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function Contas() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("affiliates").select("id, plans(name, max_accounts)").single();
  const { data: accounts } = await supabase
    .from("accounts").select("id, platform, handle, status, created_at")
    .order("created_at", { ascending: false });

  const used = accounts?.length ?? 0;
  // A relação affiliates.plan_code -> plans.code é many-to-one, então o PostgREST
  // devolve um objeto. Sem os tipos gerados do banco o supabase-js infere array;
  // normaliza os dois casos.
  const plan = (Array.isArray(me?.plans) ? me?.plans[0] : me?.plans) as
    | { name: string; max_accounts: number | null }
    | undefined;
  const limit = plan?.max_accounts ?? null;
  const cheio = limit !== null && used >= limit;

  return (
    <section>
      <div className="wrap">
        <h1>Suas contas</h1>
        <p className="lede">
          {used} conectada{used === 1 ? "" : "s"}
          {limit !== null ? ` de ${limit} no plano ${plan?.name}` : " · sem limite no seu plano"}
        </p>

        {cheio
          ? <p className="lede">Você atingiu o limite do plano. Faça upgrade para conectar mais contas.</p>
          : <p style={{ marginBottom: 18 }}>
              <a className="btn" href="/api/oauth/instagram/start">Conectar conta do Instagram</a>
            </p>}

        {used === 0 ? (
          <div className="empty">
            Nenhuma conta ainda. Antes de conectar, mude o perfil para Comercial ou Criador
            de conteúdo nas configurações do Instagram — perfil pessoal não publica por integração.
          </div>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Conta</th><th>Rede</th><th>Situação</th></tr></thead>
              <tbody>
                {accounts!.map(a => (
                  <tr key={a.id}>
                    <td>@{a.handle}</td>
                    <td>{a.platform}</td>
                    <td>
                      {a.status === "connected"
                        ? <span className="tag ok">Publicando</span>
                        : <span className="tag bad">Reconectar</span>}
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
