# FinanceX ADS — pacote para subir no Git

Projeto Next.js (App Router) + Supabase + worker de publicação.

## O que fazer

1. Descompactar na raiz de um repositório novo e vazio
2. `git add -A && git commit -m "FinanceX ADS" && git push`

Não há build nem instalação necessária antes do push — o `node_modules`
e o `.next` já estão fora pelo `.gitignore`.

## Mapa dos arquivos

- `app/` — Next.js: painel, contas, criativos, login
- `app/r/[slug]/` — link do afiliado: grava clique e redireciona
- `app/api/webhooks/sale/` — recebe a venda do gateway e lança a comissão
- `app/api/cron/materialize/` — gera os posts do dia (roda 1x/dia)
- `app/api/oauth/instagram/` — conexão de contas
- `app/c/[token]/` — link de convite (fluxo de agência, opcional)
- `lib/` — criptografia de tokens, cliente Instagram, state assinado
- `worker/` — fila de publicação, roda como serviço separado no Render
- `supabase/migrations/` — 0001 e 0002 em arquivo
- `preview/dashboard.html` — maquete estática do painel, dados fictícios

## Estado do banco

O projeto Supabase `hub-trafego` (região sa-east-1) JÁ ESTÁ MIGRADO.
Além dos dois arquivos em `supabase/migrations/`, foram aplicadas direto
no banco, e ainda não estão versionadas como arquivo:

- `fix_function_search_path`
- `financex_ads_affiliates` (afiliados, cliques, conversões, comissões, planos de conteúdo)
- `materialize_content_plan`
- `posts_affiliate_ref`
- `financex_ads_plans` (planos Starter/Pro e triggers de limite)

Para versionar: `supabase db pull` gera o schema atual como migration.

## Variáveis de ambiente

Ver `.env.example`. As que ainda não existem e precisam ser geradas:

```
openssl rand -base64 32   # TOKEN_ENC_KEY  (perder = todas as contas reconectam)
openssl rand -hex 32      # WEBHOOK_SECRET (também no gateway de pagamento)
openssl rand -hex 32      # CRON_SECRET
openssl rand -hex 32      # WORKER_SECRET
```

## Dois serviços no deploy

- **Web** (Netlify ou Render): `npm run build` / `npm start`
- **Worker** (Render): `npm run worker:build` / `npm run worker:start`

O worker não pode rodar em função serverless — upload de vídeo estoura o timeout.

## Pendente

- Tela de agendamento (montar o plano de vídeos e escolher as contas)
- Painel do dono com a visão de todos os afiliados
- Adaptadores de TikTok, YouTube e LinkedIn (o de Instagram serve de molde)
- App Review da Meta para `instagram_business_content_publish`
