# Hub de tráfego — fase 1 e 2

Auth + cofre de tokens + publicação no Instagram de ponta a ponta.

## O que já está pronto

```
supabase/migrations/0001_init.sql   schema, RLS e a função claim_targets
lib/crypto.ts                       AES-256-GCM para os tokens
lib/instagram.ts                    OAuth, refresh e publicação
lib/supabase-server.ts              cliente com sessão (respeita RLS)
lib/supabase-admin.ts               service_role (só no servidor/worker)
app/api/oauth/instagram/start       inicia a conexão
app/api/oauth/instagram/callback    salva conta + token cifrado
worker/publish.ts                   fila, retry com backoff, quota
```

## Os 3 passos que só você pode fazer

**1. Criar o app na Meta** — developers.facebook.com → novo app → produto
"Instagram" → *API setup with Instagram Login*. Copie o **Instagram App ID** e o
**Instagram App Secret** (não são os do Facebook App). Em *Business login settings*,
adicione o redirect URI exatamente igual ao do `.env`.

Requisito da conta que você vai conectar: precisa ser **profissional**
(Business ou Criador). Conta pessoal não publica por API.

**2. Gerar a chave de criptografia**

```bash
openssl rand -base64 32   # vai em TOKEN_ENC_KEY
```

Guarde fora do repositório. Se perder, todos os tokens salvos viram lixo e
todas as contas precisam reconectar.

**3. Clicar em "conectar"** — abrir `/api/oauth/instagram/start` logado.
É a única etapa manual por conta, e acontece uma vez.

## Subir

```bash
npm i @supabase/supabase-js @supabase/ssr
cp .env.example .env.local   # preencher
```

Migration: cole `supabase/migrations/0001_init.sql` no SQL Editor do Supabase
(ou `supabase db push`).

Worker no Render: tipo **Background Worker**, mesmas variáveis de ambiente,
start command apontando pra `worker/publish.ts`. Não rode isso em função
serverless — upload de vídeo estoura o timeout.

## Publicar um post

```sql
insert into posts (owner_id, caption, media, status, scheduled_for)
values (
  '<seu-user-id>',
  'Primeiro post pelo hub',
  '[{"type":"image","url":"https://cdn.exemplo.com/foto.jpg"}]'::jsonb,
  'scheduled',
  now()
) returning id;

insert into post_targets (post_id, account_id)
select '<post-id>', id from accounts where platform = 'instagram';
```

O worker pega em até 30 segundos.

## Duas armadilhas que vão te pegar

**A mídia precisa estar num URL público.** A Meta baixa o arquivo do seu
servidor. Signed URL do Supabase Storage funciona, desde que a validade cubra
o tempo de processamento do vídeo (uns minutos).

**Limite de 25 posts por conta a cada 24h.** O worker já consulta a cota antes
de publicar e reagenda em vez de queimar tentativa.

## Próximo passo

`worker/publish.ts` tem um ponto marcado onde cada plataforma nova entra como
um caso. TikTok e YouTube seguem o mesmo desenho: `lib/<plataforma>.ts` com
`authorizeUrl`, `exchangeCode`, `refreshToken` e `publish`, mais um par de
rotas de OAuth. O banco e a fila não mudam.
