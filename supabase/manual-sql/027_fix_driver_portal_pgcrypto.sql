-- Nome da alteração: Corrige o portal do motorista (pgcrypto fora do search_path)
-- Objetivo: Fazer o login do motorista (link + PIN) funcionar em produção.
-- Motivo: TODOS os RPCs do portal (driver_link_auth, driver_trip_status,
--         driver_trip_event, driver_proof_record) falham com
--         "function digest(text, unknown) does not exist", porque a extensão
--         pgcrypto está no schema `extensions` (padrão do Supabase) e
--         public.hash_driver_secret chama digest() sem qualificar o schema.
--         O fallback do app (Edge Functions) também falha: NENHUMA edge function
--         está implantada no projeto. Resultado: o login do motorista nunca
--         funcionou em produção (a geração do link funciona — o hash é feito no
--         navegador — mas a autenticação na página pública sempre quebra).
-- Risco: BAIXO. Recria uma função utilitária de 1 linha, qualificando o schema.
--        Mesmo algoritmo (SHA-256 hex), mesmos hashes — links já gerados
--        continuam válidos.
-- Pode rodar em produção? Sim.
-- Dependências: migration 202607070003_driver_portal.sql aplicada; pgcrypto
--        instalada (no schema extensions).
-- Como validar: select public.driver_link_auth('token-invalido','000000','t');
--        deve retornar jsonb {ok:false, reason:...} em vez de erro 42883.
--        Depois, abrir um link real de motorista e digitar o PIN.
-- Reversão sugerida: recriar a função com digest() sem qualificação (volta ao
--        estado quebrado — não recomendado).

create or replace function public.hash_driver_secret(p_value text)
returns text language sql immutable strict as $$
  select encode(extensions.digest(p_value, 'sha256'), 'hex')
$$;
