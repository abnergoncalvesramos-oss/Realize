export default function ConviteInvalido() {
  return (
    <section>
      <div className="wrap" style={{ maxWidth: 520 }}>
        <h1>Esse link não vale mais</h1>
        <p className="lede">
          O convite expirou ou já foi usado o número de vezes permitido. Nada foi
          conectado e nenhum dado seu foi guardado.
        </p>
        <div className="card">
          <p style={{ marginBottom: 0 }}>
            Peça um link novo para quem te enviou este. Leva um segundo para gerar.
          </p>
        </div>
      </div>
    </section>
  );
}
