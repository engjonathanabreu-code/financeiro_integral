-- Bucket privado e referências aditivas. Nenhum objeto anterior é migrado.
begin;
set local lock_timeout='5s';

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('financeiro-solicitacoes','financeiro-solicitacoes',false,20971520,
        array['application/pdf','image/png','image/jpeg']) on conflict (id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='financeiro-solicitacoes'
    and name=id and public is false and file_size_limit=20971520
    and allowed_mime_types=array['application/pdf','image/png','image/jpeg']) then
    raise exception 'O bucket de Solicitações tem configuração divergente.';
  end if;
end $$;

create schema if not exists financeiro_anexos_solicitacoes_privado;
revoke all on schema financeiro_anexos_solicitacoes_privado from public,anon,authenticated;

create table if not exists financeiro_anexos_solicitacoes_privado.anexos (
  id uuid primary key,
  solicitacao_id text not null,
  autor uuid not null,
  caminho text not null unique,
  nome text not null,
  mime text not null,
  tamanho integer not null check (tamanho between 1 and 20971520),
  reservado_em timestamptz not null default now(),
  confirmado_em timestamptz
);
alter table financeiro_anexos_solicitacoes_privado.anexos enable row level security;
revoke all on financeiro_anexos_solicitacoes_privado.anexos from public,anon,authenticated;
create index if not exists financeiro_solicitacoes_anexos_pedido
on financeiro_anexos_solicitacoes_privado.anexos(solicitacao_id, confirmado_em);

create function public.financeiro_permite_objeto_solicitacao(p_caminho text,p_enviar boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from financeiro_anexos_solicitacoes_privado.anexos a
    where a.caminho=p_caminho
    and case when p_enviar then a.autor=auth.uid() and a.confirmado_em is null
      and a.reservado_em > now()-interval '24 hours'
      and financeiro_solicitacoes_privado.pode_acessar(a.solicitacao_id,true)
    else a.confirmado_em is not null
      and financeiro_solicitacoes_privado.pode_acessar(a.solicitacao_id,false) end
  )
$$;
revoke all on function public.financeiro_permite_objeto_solicitacao(text,boolean) from public,anon;
grant execute on function public.financeiro_permite_objeto_solicitacao(text,boolean) to authenticated;

drop policy if exists financeiro_solicitacao_objeto_limitar_leitura on storage.objects;
drop policy if exists financeiro_solicitacao_objeto_limitar_envio on storage.objects;
drop policy if exists financeiro_solicitacao_objeto_bloquear_anon on storage.objects;
drop policy if exists financeiro_solicitacao_objeto_preservar on storage.objects;
drop policy if exists financeiro_solicitacao_objeto_nao_apagar on storage.objects;
create policy financeiro_solicitacao_objeto_ler on storage.objects for select to authenticated
using (bucket_id='financeiro-solicitacoes' and public.financeiro_permite_objeto_solicitacao(name,false));
create policy financeiro_solicitacao_objeto_limitar_leitura on storage.objects as restrictive for select to authenticated
using (case when bucket_id='financeiro-solicitacoes'
  then storage.allow_only_operation('object.get_authenticated')
    and public.financeiro_permite_objeto_solicitacao(name,false)
  else true end);
create policy financeiro_solicitacao_objeto_enviar on storage.objects for insert to authenticated
with check (bucket_id='financeiro-solicitacoes' and public.financeiro_permite_objeto_solicitacao(name,true));
create policy financeiro_solicitacao_objeto_limitar_envio on storage.objects as restrictive for insert to authenticated
with check (case when bucket_id='financeiro-solicitacoes' then public.financeiro_permite_objeto_solicitacao(name,true) else true end);
create policy financeiro_solicitacao_objeto_bloquear_anon on storage.objects as restrictive for all to anon
using (bucket_id<>'financeiro-solicitacoes') with check (bucket_id<>'financeiro-solicitacoes');
create policy financeiro_solicitacao_objeto_preservar on storage.objects as restrictive for update to authenticated
using (bucket_id<>'financeiro-solicitacoes') with check (bucket_id<>'financeiro-solicitacoes');
create policy financeiro_solicitacao_objeto_nao_apagar on storage.objects as restrictive for delete to authenticated
using (bucket_id<>'financeiro-solicitacoes');

create or replace function financeiro_anexos_solicitacoes_privado.apresentar(p_anexo financeiro_anexos_solicitacoes_privado.anexos)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',p_anexo.id,'path',p_anexo.caminho,'name',p_anexo.nome,'mime',p_anexo.mime,
    'size',p_anexo.tamanho,'confirmedAt',p_anexo.confirmado_em)
$$;
revoke all on function financeiro_anexos_solicitacoes_privado.apresentar(financeiro_anexos_solicitacoes_privado.anexos)
from public,anon,authenticated;

create function public.financeiro_listar_anexos_solicitacao(p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(financeiro_solicitacoes_privado.pode_acessar(p_id,false),false) then
    raise exception using errcode='42501',message='Solicitação indisponível.';
  end if;
  return (select coalesce(jsonb_agg(financeiro_anexos_solicitacoes_privado.apresentar(a)
                order by a.confirmado_em,a.id),'[]'::jsonb)
          from financeiro_anexos_solicitacoes_privado.anexos a
          where a.solicitacao_id=p_id and a.confirmado_em is not null);
end
$$;

create function public.financeiro_reservar_anexo_solicitacao(
  p_id text,p_arquivo uuid,p_nome text,p_mime text,p_tamanho integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a financeiro_anexos_solicitacoes_privado.anexos; ator uuid := auth.uid();
begin
  if not coalesce(financeiro_solicitacoes_privado.pode_acessar(p_id,false),false) then
    raise exception using errcode='42501',message='Solicitação indisponível.';
  end if;
  p_nome := btrim(p_nome);
  if p_arquivo is null or nullif(p_nome,'') is null or length(p_nome)>160
    or p_nome ~ '[[:cntrl:]/\\]' or p_mime is null or p_mime not in ('application/pdf','image/png','image/jpeg')
    or p_tamanho is null or p_tamanho not between 1 and 20971520 then
    raise exception using errcode='22023',message='Informe um arquivo PDF, PNG ou JPEG de até 20 MB e um nome válido.';
  end if;
  perform 1 from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  if not coalesce(financeiro_solicitacoes_privado.pode_acessar(p_id,false),false) then
    raise exception using errcode='42501',message='Solicitação indisponível.';
  end if;
  select * into a from financeiro_anexos_solicitacoes_privado.anexos where id=p_arquivo;
  if found then
    if a.autor<>ator or a.solicitacao_id<>p_id or a.nome<>p_nome or a.mime<>p_mime or a.tamanho<>p_tamanho then
      raise exception using errcode='22023',message='Não foi possível reservar este anexo.';
    end if;
    if a.confirmado_em is not null then
      return financeiro_anexos_solicitacoes_privado.apresentar(a);
    end if;
  end if;
  if not coalesce(financeiro_solicitacoes_privado.pode_acessar(p_id,true),false) then
    raise exception using errcode='42501',message='O estado atual da solicitação impede anexos.';
  end if;
  if a.id is not null then
    if a.reservado_em <= now()-interval '24 hours' then
      raise exception using errcode='22023',message='A reserva expirou. Selecione o arquivo novamente.';
    end if;
    return financeiro_anexos_solicitacoes_privado.apresentar(a);
  end if;
  if (select count(*) from financeiro_anexos_solicitacoes_privado.anexos
      where solicitacao_id=p_id and (confirmado_em is not null or reservado_em>now()-interval '24 hours')) >= 25 then
    raise exception using errcode='22023',message='Esta solicitação atingiu o limite de 25 anexos e reservas em andamento.';
  end if;
  insert into financeiro_anexos_solicitacoes_privado.anexos
    (id,solicitacao_id,autor,caminho,nome,mime,tamanho)
  values(p_arquivo,p_id,ator,ator::text||'/'||p_arquivo::text,p_nome,p_mime,p_tamanho)
  returning * into a;
  return financeiro_anexos_solicitacoes_privado.apresentar(a);
end
$$;

create function public.financeiro_confirmar_anexo_solicitacao(p_id text,p_arquivo uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a financeiro_anexos_solicitacoes_privado.anexos;
begin
  if not coalesce(financeiro_solicitacoes_privado.pode_acessar(p_id,false),false) then
    raise exception using errcode='42501',message='Solicitação indisponível.';
  end if;
  perform 1 from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  if not coalesce(financeiro_solicitacoes_privado.pode_acessar(p_id,false),false) then
    raise exception using errcode='42501',message='Solicitação indisponível.';
  end if;
  select * into a from financeiro_anexos_solicitacoes_privado.anexos
  where id=p_arquivo and solicitacao_id=p_id and autor=auth.uid();
  if not found then
    raise exception using errcode='42501',message='Reserva indisponível.';
  end if;
  if a.confirmado_em is not null then
    return financeiro_anexos_solicitacoes_privado.apresentar(a);
  end if;
  if not coalesce(financeiro_solicitacoes_privado.pode_acessar(p_id,true),false)
    or a.reservado_em <= now()-interval '24 hours' then
    raise exception using errcode='42501',message='Anexo indisponível para confirmação.';
  end if;
  if not exists(select 1 from storage.objects o
    where o.bucket_id='financeiro-solicitacoes' and o.name=a.caminho
      and o.metadata->>'size'=a.tamanho::text and o.metadata->>'mimetype'=a.mime) then
    raise exception using errcode='22023',message='O original ainda não foi localizado ou diverge da reserva.';
  end if;
  update financeiro_anexos_solicitacoes_privado.anexos
  set confirmado_em=clock_timestamp() where id=p_arquivo returning * into a;
  perform financeiro_solicitacoes_privado.registrar_evento(p_id,'attach',a.nome,null,false,null,null);
  return financeiro_anexos_solicitacoes_privado.apresentar(a);
end
$$;

revoke all on function public.financeiro_listar_anexos_solicitacao(text),
  public.financeiro_reservar_anexo_solicitacao(text,uuid,text,text,integer),
  public.financeiro_confirmar_anexo_solicitacao(text,uuid) from public,anon;
grant execute on function public.financeiro_listar_anexos_solicitacao(text),
  public.financeiro_reservar_anexo_solicitacao(text,uuid,text,text,integer),
  public.financeiro_confirmar_anexo_solicitacao(text,uuid) to authenticated;
commit;
