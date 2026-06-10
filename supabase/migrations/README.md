# Migrations

## Estrutura

- **`./` (raiz)** · migrations escritas e pendentes de aplicação. Após rodar no SQL Editor do Dashboard, mover pra `applied/`.
- **`applied/`** · histórico cronológico das mudanças que já foram aplicadas ao banco. Esta pasta foi esvaziada na limpeza de jun/2026 (o histórico vive em `supabase/schema.sql` e no git tag `schema-pre-cleanup`). Daqui em diante, todo patch novo segue o fluxo abaixo.

## Fluxo de migration nova

1. Criar `migrations/<YYYY-MM-DD>_<descricao>.sql`
2. Cabeçalho do SQL deve listar premissas (idempotência, dependências, rollback)
3. Rodar no SQL Editor do Dashboard (sem CLI — convenção do projeto)
4. Confirmar OK
5. Mover o arquivo pra `applied/` e commitar
6. Atualizar `supabase/schema.sql` com o novo estado canônico (ver seção "Regenerar schema.sql" abaixo)
7. Bumpar `APP_VERSION` em `src/components/app-nav.tsx` antes do commit em main

## Regras gerais

- **Idempotência sempre que possível** (`if not exists`, `drop ... if exists`).
- **Comentário no topo** explicando o quê e por quê.
- **Sem ALTER destrutivo sem rollback** — se for dropar coluna, anotar como reverter.
- **Dependências explícitas** no topo se o patch precisa de outro rodado antes.

## Regenerar `supabase/schema.sql`

Após mudanças no banco, atualizar o `schema.sql` capturando o estado vivo via queries em `pg_catalog`. Rodar os 8 blocos no SQL Editor e colar outputs no `schema.sql` mantendo a estrutura por seção.

### Bloco 1 · Tabelas
```sql
select c.relname as tabela,
       'create table public.' || c.relname || ' (' || E'\n  ' ||
         string_agg(
           quote_ident(a.attname) || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod)
           || case when a.attnotnull then ' not null' else '' end
           || case when ad.adbin is not null then ' default ' || pg_get_expr(ad.adbin, ad.adrelid) else '' end,
           E',\n  ' order by a.attnum)
       || E'\n);' as ddl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname order by c.relname;
```

### Bloco 2 · Constraints (PK, FK, CHECK, UNIQUE)
```sql
select c.relname || ' · ' || con.conname as label,
       'alter table public.' || c.relname || ' add constraint '
       || quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid) || ';' as ddl
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, con.conname;
```

### Bloco 3 · Indexes (não-PK)
```sql
select indexname, indexdef || ';' as ddl
from pg_indexes
where schemaname = 'public'
  and indexname not in (select conname from pg_constraint where contype = 'p')
order by tablename, indexname;
```

### Bloco 4a · Functions
```sql
select p.proname as funcao, pg_get_functiondef(p.oid) || ';' as ddl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname;
```

### Bloco 4b · Triggers
```sql
select t.tgname, pg_get_triggerdef(t.oid) || ';' as ddl
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
order by c.relname, t.tgname;
```

### Bloco 5 · RLS policies
```sql
select c.relname as tabela, pol.polname,
       'create policy ' || quote_ident(pol.polname) || ' on public.' || quote_ident(c.relname)
       || case pol.polpermissive when false then ' as restrictive' else '' end
       || ' for ' || case pol.polcmd when 'r' then 'select' when 'a' then 'insert'
                                      when 'w' then 'update' when 'd' then 'delete'
                                      when '*' then 'all' end
       || coalesce(' using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')', '')
       || coalesce(' with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')', '')
       || ';' as ddl
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by c.relname, pol.polname;
```

### Bloco 6 · RLS enable
```sql
select c.relname,
       'alter table public.' || quote_ident(c.relname) || ' enable row level security;' as ddl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
order by c.relname;
```

### Bloco 7 · Replica identity FULL
```sql
select c.relname,
       'alter table public.' || quote_ident(c.relname) || ' replica identity full;' as ddl
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relreplident = 'f'
order by c.relname;
```

### Bloco 8 · Publications (realtime)
```sql
select pubname, tablename,
       'alter publication ' || quote_ident(pubname) || ' add table public.' || quote_ident(tablename) || ';' as ddl
from pg_publication_tables
where schemaname = 'public'
order by pubname, tablename;
```
