// Página de acompanhamento que a resposta do callback de exclusão aponta.
// A Meta abre esta URL para conferir que o pedido foi mesmo processado.
export default async function ExclusaoDeDados({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <section>
      <div className="wrap" style={{ maxWidth: 560 }}>
        <h1>Dados excluídos</h1>
        <p className="lede">
          O pedido foi processado. A conta do Instagram foi desconectada e o token de
          acesso, as publicações agendadas e o histórico de envio dela foram apagados.
        </p>
        {code && (
          <div className="card">
            <p style={{ marginBottom: 0 }}>
              Código de confirmação: <code>{code}</code>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
