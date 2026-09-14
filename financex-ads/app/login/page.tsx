"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  async function entrar() {
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setCarregando(false);
    if (error) setErro("Não foi possível enviar o link. Confira o email e tente de novo.");
    else setSent(true);
  }

  return (
    <section>
      <div className="wrap" style={{ maxWidth: 420 }}>
        <h1>Entrar</h1>
        {sent ? (
          <p className="lede">
            Link enviado para {email}. Abra o email neste mesmo aparelho para entrar.
          </p>
        ) : (
          <>
            <p className="lede">Enviamos um link de acesso por email. Sem senha para esquecer.</p>
            <div className="card">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                style={{ width: "100%", padding: 10, border: "1px solid var(--line)",
                         borderRadius: 4, fontSize: 15, marginBottom: 12 }}
              />
              <button className="btn" onClick={entrar} disabled={!email || carregando}>
                {carregando ? "Enviando…" : "Enviar link de acesso"}
              </button>
              {erro && <p style={{ color: "var(--alert)", fontSize: 13, marginBottom: 0 }}>{erro}</p>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
