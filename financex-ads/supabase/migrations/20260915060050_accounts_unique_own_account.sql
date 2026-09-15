-- A constraint de 0002 é unique (client_id, platform, external_id). Para a conta
-- da própria agência client_id é null, e no Postgres dois nulls não são iguais,
-- então a mesma conta reconectada entrava de novo em vez de atualizar.
-- Índice parcial fecha o caso, sem afetar as contas de cliente.
create unique index if not exists accounts_owner_platform_external_idx
  on accounts (owner_id, platform, external_id)
  where client_id is null;
