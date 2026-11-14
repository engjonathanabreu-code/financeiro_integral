begin;
set local lock_timeout='5s';

do $$
begin
  if (select md5(prosrc) from pg_proc where oid='public.financeiro_ailos(text,jsonb)'::regprocedure)
     is distinct from 'c9c7ba5b13187d27166002acd92569c8'
     or (select md5(prosrc) from pg_proc where oid='ailos_privado.operar(text,jsonb)'::regprocedure)
     is distinct from 'c719a29b677fa08d253cc466ff85fa91'
     or (select md5(prosrc) from pg_proc where oid='ailos_privado.operar_legado_p1(text,jsonb)'::regprocedure)
     is distinct from '92f7f17f3508ca2d27edba4fc287fed6'
     or (select md5(prosrc) from pg_proc where oid='ailos_privado.operar_v2(text,jsonb)'::regprocedure)
     is distinct from '21613ecc591249d87e0758ed534a90d2'
     or (select md5(prosrc) from pg_proc where oid='ailos_privado.operar_v3(text,jsonb)'::regprocedure)
     is distinct from '3166ef3e1179345b98554e6c937a370a' then
    raise exception 'Confira o corpo ativo das funções de cobrança antes de instalar esta versão.';
  end if;
end $$;

alter table ailos_privado.retornos
  add column origem text,
  add column arquivo text,
  add column revisao_previa text;

alter table ailos_privado.eventos
  add column retorno_hash text references ailos_privado.retornos(hash);

create index ailos_eventos_boleto_id_idx on ailos_privado.eventos(boleto_id);
create index ailos_eventos_retorno_hash_idx on ailos_privado.eventos(retorno_hash) where retorno_hash is not null;

comment on column ailos_privado.retornos.origem is 'Canal declarado pelo operador; o arquivo não tem autenticação bancária independente.';
comment on column ailos_privado.eventos.retorno_hash is 'Primeiro arquivo original confirmado que introduziu este evento.';

create function ailos_privado.cnab_texto(v text,n integer) returns text
language plpgsql immutable set search_path='' as $$
declare s text;
begin
  s:=upper(regexp_replace(normalize(btrim(regexp_replace(v,U&'[[:space:]\00a0\1680\2000-\200a\2028\2029\202f\205f\3000\feff]+',' ','g')),NFD),U&'[\0300-\036f]','','g'));
  if v is null or v ~ E'[\r\n]' or s !~ '^[A-Z0-9 .,/-]*$' or length(s)>n then
    raise exception 'Campo CNAB inválido ou acima de % caracteres',n;
  end if;
  return rpad(s,n);
end $$;

create function ailos_privado.cnab_num(v text,n integer) returns text
language plpgsql immutable set search_path='' as $$
begin
  if v is null or v !~ '^\d+$' or length(v)>n then raise exception 'Campo numérico CNAB inválido'; end if;
  return lpad(v,n,'0');
end $$;

create function ailos_privado.cnab_dv(s text, modulo integer) returns integer
language plpgsql immutable set search_path='' as $$
declare soma int:=0; peso int:=2; v int; dv int;
begin
  for i in reverse length(s)..1 loop
    v:=substr(s,i,1)::int*peso;
    soma:=soma+case when modulo=10 then v/10+v%10 else v end;
    peso:=case when modulo=10 then 3-peso when peso=9 then 2 else peso+1 end;
  end loop;
  if modulo=10 then return (10-soma%10)%10; end if;
  dv:=11-soma%11;
  return case when dv>=10 or dv=0 then 1 else dv end;
end $$;

create function ailos_privado.cnab_conta(c jsonb) returns text
language sql immutable set search_path='' as $$
  select ailos_privado.cnab_num(c->>'agencia',5)||ailos_privado.cnab_texto(c->>'agencia_dv',1)
      ||ailos_privado.cnab_num(c->>'conta',12)||ailos_privado.cnab_texto(c->>'conta_dv',1)||' '
$$;

create function ailos_privado.cnab_documento_valido(doc text) returns boolean
language plpgsql immutable set search_path='' as $$
declare n integer; soma integer; dv integer;
begin
  if doc is null or doc !~ '^(\d{11}|\d{14})$' or doc ~ '^(\d)\1+$' then return false; end if;
  n:=length(doc)-2;
  for tamanho in n..n+1 loop
    soma:=0;
    for i in 1..tamanho loop
      soma:=soma+substr(doc,i,1)::integer*(case when n=9 then tamanho+2-i else 2+(tamanho-i)%8 end);
    end loop;
    dv:=11-soma%11;
    if substr(doc,tamanho+1,1)::integer<>(case when dv>=10 then 0 else dv end) then return false; end if;
  end loop;
  return true;
end $$;

create function ailos_privado.cnab_remessa(r jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  c jsonb:=r->'config'; b jsonb; p jsonb;
  dt text:=to_char((r->>'data')::date,'DDMMYYYY');
  seq text:=ailos_privado.cnab_num(r->>'sequencia',6);
  conta text:=ailos_privado.cnab_conta(c); tipo text; doc text;
  arquivo text; codigos jsonb:='[]'::jsonb; nn text; cep text; uf text;
  venc date; fator integer; valor bigint; total bigint:=0; detalhes int:=0;
  livre text; bruto text; barra text; linha text; dv int; f1 text; f2 text; f3 text;
  n integer:=jsonb_array_length(r->'boletos');
begin
  doc:=regexp_replace(c->>'cpf_cnpj','[./[:space:]-]','','g');
  tipo:=case when length(doc)=11 then '1' else '2' end;
  if n not between 1 and 500 or n is null or seq='000000' or dt is null
     or not ailos_privado.cnab_documento_valido(doc)
     or c->>'ambiente' not in ('homologacao','producao') or c->>'carteira' is distinct from '01'
     or c->>'ambiente'='producao' and c->'homologado' is distinct from 'true'::jsonb
     or coalesce(c->>'convenio','') !~ '^\d{6}$' or coalesce(c->>'agencia','') !~ '^\d{4}$'
     or coalesce(c->>'conta','') !~ '^\d{7}$' or coalesce(c->>'agencia_dv','') !~ '^\d$'
     or coalesce(c->>'conta_dv','') !~ '^\d$' or coalesce(btrim(c->>'nome'),'')=''
     or coalesce(btrim(c->>'cooperativa'),'')='' or coalesce(btrim(c->>'endereco'),'')='' then
    raise exception 'Confira o convênio e a reserva da remessa';
  end if;
  perform ailos_privado.cnab_texto(c->>'endereco',70);
  arquivo:=rpad('08500000'||repeat(' ',9)||tipo||ailos_privado.cnab_num(doc,14)
    ||ailos_privado.cnab_texto(c->>'convenio',20)||conta||ailos_privado.cnab_texto(c->>'nome',30)
    ||ailos_privado.cnab_texto(c->>'cooperativa',30)||repeat(' ',10)||'1'||dt||'120000'||seq||'08400000',240)||E'\r\n'
    ||rpad('08500011R01  043 '||tipo||ailos_privado.cnab_num(doc,15)
    ||ailos_privado.cnab_texto(c->>'convenio',20)||conta||ailos_privado.cnab_texto(c->>'nome',30)
    ||repeat(' ',80)||lpad(seq,8,'0')||dt||repeat('0',8),240)||E'\r\n';

  for b in select value from jsonb_array_elements(r->'boletos') loop
    p:=b->'pagador';
    nn:=b->>'nosso_numero';
    doc:=regexp_replace(p->>'cpf_cnpj','[./[:space:]-]','','g');
    tipo:=case when length(doc)=11 then '1' else '2' end;
    cep:=regexp_replace(p->>'cep','[./[:space:]-]','','g');
    uf:=upper(btrim(p->>'uf'));
    venc:=(b->>'vencimento')::date;
    valor:=((b->>'valor')::numeric*100)::bigint;
    fator:=case when venc>=date '2025-02-22' then venc-date '2025-02-22'+1000 else venc-date '1997-10-07' end;
    if coalesce(nn,'') !~ '^\d{17}$' or left(nn,8) is distinct from (c->>'conta')||(c->>'conta_dv')
       or right(nn,9)='000000000' or venc is null or venc<(r->>'data')::date or fator not between 1000 and 9999
       or valor is null or valor not between 1 and 9999999999 or (b->>'valor')::numeric*100<>valor
       or not ailos_privado.cnab_documento_valido(doc)
       or doc=regexp_replace(c->>'cpf_cnpj','[./[:space:]-]','','g') or coalesce(cep,'') !~ '^\d{8}$'
       or coalesce(uf,'') !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$'
       or coalesce(btrim(p->>'nome'),'')='' or coalesce(btrim(p->>'endereco'),'')=''
       or coalesce(btrim(p->>'bairro'),'')='' or coalesce(btrim(p->>'cidade'),'')='' then
      raise exception 'Confira os dados do título e do pagador na remessa';
    end if;
    total:=total+valor;
    livre:=(c->>'convenio')||nn||(c->>'carteira');
    bruto:='0859'||ailos_privado.cnab_num(fator::text,4)||ailos_privado.cnab_num(valor::text,10)||livre;
    dv:=ailos_privado.cnab_dv(bruto,11);
    barra:=left(bruto,4)||dv||substr(bruto,5);
    f1:='0859'||left(livre,5); f2:=substr(livre,6,10); f3:=substr(livre,16);
    linha:=f1||ailos_privado.cnab_dv(f1,10)||f2||ailos_privado.cnab_dv(f2,10)||f3||ailos_privado.cnab_dv(f3,10)||dv||substr(bruto,5,14);
    codigos:=codigos||jsonb_build_array(jsonb_build_object('id',b->>'id','codigo_barras',barra,'linha_digitavel',linha));

    arquivo:=arquivo||'08500013'||ailos_privado.cnab_num((detalhes+1)::text,5)||'P 01'||conta
      ||ailos_privado.cnab_texto(nn,20)||'11122'||ailos_privado.cnab_texto(b->>'documento',15)||to_char(venc,'DDMMYYYY')
      ||ailos_privado.cnab_num(valor::text,15)||'00000004N'||dt||'3'||repeat('0',24)||repeat('0',53)
      ||ailos_privado.cnab_texto(b->>'documento',25)||'300200009'||repeat('0',10)||' '||E'\r\n'
      ||rpad('08500013'||ailos_privado.cnab_num((detalhes+2)::text,5)||'Q 01'||tipo||ailos_privado.cnab_num(doc,15)
      ||ailos_privado.cnab_texto(p->>'nome',40)||ailos_privado.cnab_texto(p->>'endereco',40)
      ||ailos_privado.cnab_texto(p->>'bairro',15)||cep||ailos_privado.cnab_texto(p->>'cidade',15)||uf
      ||repeat('0',16)||repeat(' ',40)||'000',240)||E'\r\n';
    detalhes:=detalhes+2;
  end loop;
  arquivo:=arquivo||rpad('08500015'||repeat(' ',9)||ailos_privado.cnab_num((detalhes+2)::text,6)
    ||ailos_privado.cnab_num(n::text,6)||ailos_privado.cnab_num(total::text,17)||repeat('0',69),240)||E'\r\n'
    ||rpad('08599999'||repeat(' ',9)||'000001'||ailos_privado.cnab_num((detalhes+4)::text,6)||'000000',240)||E'\r\n';
  return jsonb_build_object('arquivo',arquivo,'nome','AILOS-'||case when c->>'ambiente'='homologacao' then 'HOM-' else '' end||seq||'.REM','codigos',codigos);
end $$;

create function ailos_privado.cnab_data(s text, opcional boolean default false) returns date
language plpgsql immutable set search_path='' as $$
begin
  if opcional and s='00000000' then return null; end if;
  if s !~ '^\d{8}$' then raise exception 'Data bancária inválida'; end if;
  return make_date(right(s,4)::int,substr(s,3,2)::int,left(s,2)::int);
end $$;

create function ailos_privado.cnab_retorno(bruto text, cfg jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  linhas text[]; s text; cabecalho text; rodape text; lote text; conta text;
  n integer; n_lotes integer:=0; inicio integer; seq integer; tipo text;
  t jsonb; eventos jsonb:='[]'::jsonb;
begin
  if bruto is null or octet_length(bruto)>3000000 then raise exception 'Retorno vazio ou maior que 3 MB'; end if;
  linhas:=string_to_array(regexp_replace(replace(bruto,E'\r\n',E'\n'),E'\n$',''),E'\n');
  n:=cardinality(linhas);
  if n<6 or n is null then raise exception 'Envie um retorno CNAB 240 completo'; end if;
  foreach s in array linhas loop
    if length(s)<>240 or left(s,3)<>'085' or s collate "C" !~ '^[ -~]*$' then
      raise exception 'O retorno deve conter linhas Ailos de 240 caracteres ASCII';
    end if;
  end loop;

  cabecalho:=linhas[1]; rodape:=linhas[n];
  conta:=left(ailos_privado.cnab_conta(cfg),19);
  if substr(cabecalho,4,5)<>'00000' or substr(cabecalho,143,1)<>'2' or substr(rodape,4,5)<>'99999'
     or substr(rodape,24,6)<>lpad(n::text,6,'0') then
    raise exception 'Cabeçalho, tipo ou total de registros do retorno inválido';
  end if;
  if btrim(substr(cabecalho,33,20)) is distinct from cfg->>'convenio'
     or substr(cabecalho,53,19) is distinct from conta
     or substr(cabecalho,19,14) is distinct from ailos_privado.cnab_num(regexp_replace(cfg->>'cpf_cnpj','[./[:space:]-]','','g'),14) then
    raise exception 'Retorno pertence a outro beneficiário, convênio ou conta';
  end if;

  for i in 2..n-1 loop
    s:=linhas[i]; tipo:=substr(s,8,1);
    if tipo='1' then
      if lote is not null or substr(s,9,3)<>'T01'
         or substr(s,4,4) !~ '^[0-9]{4}$' or substr(s,4,4) in ('0000','9999')
         or btrim(substr(s,34,20)) is distinct from cfg->>'convenio'
         or substr(s,54,19) is distinct from conta then
        raise exception 'Lote aberto, serviço inválido ou lote de outra conta';
      end if;
      lote:=substr(s,4,4); inicio:=i; seq:=0; n_lotes:=n_lotes+1;
      continue;
    end if;
    if lote is null or substr(s,4,4)<>lote then raise exception 'Lote inconsistente'; end if;
    if tipo='5' then
      if t is not null or seq<2 or substr(s,18,6)<>lpad((i-inicio+1)::text,6,'0') then
        raise exception 'Trailer de lote ou par T/U incompleto';
      end if;
      lote:=null;
      continue;
    end if;
    seq:=seq+1;
    if tipo<>'3' or substr(s,9,5)<>lpad(seq::text,5,'0') or substr(s,16,2) !~ '^\d{2}$' then
      raise exception 'Sequência ou ocorrência do retorno inválida';
    end if;
    if substr(s,14,1)='T' then
      if t is not null or substr(s,18,19) is distinct from conta
         or btrim(substr(s,38,20)) !~ '^\d{17}$' or left(btrim(substr(s,38,20)),8)<>(cfg->>'conta')||(cfg->>'conta_dv')
         or substr(s,82,15) !~ '^\d{15}$' or substr(s,134,15) !~ '^\d{15}$' then
        raise exception 'Segmento T sem U, título de outra conta ou dados inválidos';
      end if;
      t:=jsonb_build_object('nosso_numero',btrim(substr(s,38,20)),'documento',btrim(substr(s,59,15)),
        'vencimento',ailos_privado.cnab_data(substr(s,74,8)),'valor_centavos',substr(s,82,15)::bigint,
        'cpf_cnpj',ltrim(substr(s,134,15),'0'),'ocorrencia',substr(s,16,2),'motivos',btrim(substr(s,214,10)));
    elsif substr(s,14,1)='U' then
      if t is null or t->>'ocorrencia'<>substr(s,16,2) or substr(s,78,15) !~ '^\d{15}$'
         or substr(s,93,15) !~ '^\d{15}$' then raise exception 'Par T/U incompatível'; end if;
      eventos:=eventos||jsonb_build_array(t||jsonb_build_object(
        'pago_centavos',substr(s,78,15)::bigint,'liquido_centavos',substr(s,93,15)::bigint,
        'data',ailos_privado.cnab_data(substr(s,138,8)),'credito',ailos_privado.cnab_data(substr(s,146,8),true)));
      t:=null;
      if jsonb_array_length(eventos)>500 then raise exception 'O retorno deve conter de 1 a 500 títulos'; end if;
    else
      raise exception 'Segmento de retorno não suportado';
    end if;
  end loop;
  if lote is not null or t is not null or substr(rodape,18,6)<>lpad(n_lotes::text,6,'0')
     or jsonb_array_length(eventos)=0 then raise exception 'Arquivo de retorno incompleto'; end if;
  return eventos;
end $$;

create function ailos_privado.cnab_chave_evento(id_boleto uuid, evento jsonb) returns text
language sql immutable set search_path='' as $$
  -- Identidade compatível com a trilha gravada pelas versões anteriores.
  select md5(jsonb_build_array(id_boleto,evento->>'ocorrencia',evento->>'data',
    evento->>'pago_centavos',evento->>'liquido_centavos',evento->>'motivos')::text)
$$;

create function ailos_privado.conferir_ordem_retorno(eventos jsonb) returns void
language plpgsql stable set search_path='' as $$
declare
  item record;
begin
  for item in
    select b.id, b.estado, e as dados
    from jsonb_array_elements(eventos) e
    join ailos_privado.boletos b on b.nosso_numero=e->>'nosso_numero'
    where not exists (select 1 from ailos_privado.eventos x
      where x.chave=ailos_privado.cnab_chave_evento(b.id,e))
  loop
    -- A reexportação de um evento já registrado é idempotente mesmo depois de nova ocorrência.
    if exists (
      select 1 from ailos_privado.eventos anterior where anterior.boleto_id=item.id
      and case when pg_input_is_valid(anterior.dados->>'data','date')
        then (anterior.dados->>'data')::date > (item.dados->>'data')::date else false end
    ) or (item.estado='Baixado' and item.dados->>'ocorrencia' not in ('09','17'))
      or (item.estado='Rejeitado' and item.dados->>'ocorrencia' not in ('03','09','06','17'))
      or (item.estado in ('Liquidado','Conferir parcial') and item.dados->>'ocorrencia' in ('06','17'))
    then
      raise exception 'Ocorrência fora de ordem ou incompatível com o título. Confira o histórico antes de importar.';
    end if;
  end loop;

  -- Ocorrências conflitantes na mesma data não trazem ordem bancária inequívoca.
  if exists (
    select 1 from jsonb_array_elements(eventos) e
    join ailos_privado.boletos b on b.nosso_numero=e->>'nosso_numero'
    where not exists (select 1 from ailos_privado.eventos x
      where x.chave=ailos_privado.cnab_chave_evento(b.id,e))
    group by b.id,e->>'data'
    having count(distinct ailos_privado.cnab_chave_evento(b.id,e))>1
  ) or exists (
    -- Validar a ordem dentro do próprio arquivo, pois a rotina de aplicação processa por data.
    select 1 from jsonb_array_elements(eventos) a
    join jsonb_array_elements(eventos) b on b->>'nosso_numero'=a->>'nosso_numero'
    where (b->>'data')::date > (a->>'data')::date and
      (a->>'ocorrencia' in ('06','17') and b->>'ocorrencia' in ('06','17')
       or a->>'ocorrencia'='09' and b->>'ocorrencia' not in ('09','17')
       or a->>'ocorrencia'='03' and b->>'ocorrencia' not in ('03','09','06','17'))
  ) then
    raise exception 'O arquivo contém ocorrências sem ordem inequívoca para o mesmo título. Confira antes de importar.';
  end if;
end $$;

create or replace function public.financeiro_ailos(acao text,dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  rem ailos_privado.remessas; cfg jsonb; artefatos jsonb; resultado jsonb; anterior ailos_privado.retornos;
  bruto text; eventos jsonb; ambiente_retorno text; arquivo_hash text; revisao text; canal text; nome text;
  n integer; identificados integer; novos_eventos text[]; estado_previa jsonb; revisao_atual text;
begin
  if auth.uid() is null or not public.can_access_fin_recebimentos()
     or (acao='configurar' and not public.is_admin()) then
    raise exception using errcode='42501',message='Sem permissão para cobrança bancária';
  end if;

  if acao='configurar' and dados->'config'->>'ambiente' is distinct from 'homologacao' then
    raise exception using errcode='42501',message='O Ailos está restrito à homologação.';
  end if;

  -- A mesma trava já protege reserva e retorno nas versões anteriores.
  if acao in ('preparar','preparar_carne','finalizar','retorno') then
    perform pg_advisory_xact_lock(850240);
  end if;
  if acao in ('preparar','preparar_carne','finalizar','previa_retorno','retorno') then
    select c.dados into cfg from ailos_privado.config c where id=1;
    if not found then raise exception 'Configure o convênio primeiro'; end if;
    if cfg->>'ambiente' is distinct from 'homologacao' then
      raise exception using errcode='42501',message='O Ailos está restrito à homologação.';
    end if;
  end if;

  if acao in ('preparar','preparar_carne') then
    resultado:=ailos_privado.operar_v3(acao,dados);
    if resultado->'config'->>'ambiente' is distinct from 'homologacao' then
      raise exception using errcode='42501',message='A reserva não pertence à homologação.';
    end if;
    -- Se a reserva não for compatível com o layout, reverte também a alocação de números.
    perform ailos_privado.cnab_remessa(resultado);
    return resultado;
  end if;

  if acao='remessa' then
    resultado:=ailos_privado.operar_v3(acao,dados);
    return resultado || jsonb_build_object('codigos',coalesce((
      select jsonb_object_agg(b.id,jsonb_build_object('linha_digitavel',b.linha_digitavel,'codigo_barras',b.codigo_barras))
      from ailos_privado.boletos b where b.remessa_id=(dados->>'id')::uuid
    ),'{}'::jsonb));
  end if;

  if acao='finalizar' then
    select * into rem from ailos_privado.remessas where id=(dados->>'id')::uuid for update;
    if not found then raise exception 'Remessa não encontrada'; end if;
    if rem.ambiente is distinct from 'homologacao' or rem.snapshot->'config'->>'ambiente' is distinct from rem.ambiente then
      raise exception using errcode='42501',message='A reserva não pertence à homologação.';
    end if;
    if rem.arquivo is not null then
      return jsonb_build_object('ok',true,'arquivo',rem.arquivo,'nome',rem.nome);
    end if;
    if dados->'confirmar' is distinct from 'true'::jsonb then
      raise exception 'Atualize o Financeiro e confirme a conclusão da remessa reservada';
    end if;
    artefatos:=ailos_privado.cnab_remessa(rem.snapshot);
    if (dados ? 'arquivo' and dados->>'arquivo' is distinct from artefatos->>'arquivo')
       or (dados ? 'codigos' and dados->'codigos' is distinct from artefatos->'codigos') then
      raise exception 'Arquivo ou códigos da remessa divergem da reserva';
    end if;
    if exists (
      select 1 from jsonb_array_elements(rem.snapshot->'boletos') b
      left join ailos_privado.boletos atual on atual.id=(b->>'id')::uuid and atual.remessa_id=rem.id
      where atual.snapshot is distinct from b or atual.ambiente is distinct from rem.ambiente
        or atual.nosso_numero is distinct from b->>'nosso_numero' or atual.estado is distinct from 'Reservado'
    ) then raise exception 'O título não corresponde à reserva da remessa'; end if;
    perform ailos_privado.operar_v3('finalizar',jsonb_build_object('id',rem.id)||artefatos);
    return (artefatos-'codigos')||'{"ok":true}'::jsonb;
  end if;

  if acao in ('previa_retorno','retorno') then
    bruto:=dados->>'arquivo';
    canal:=btrim(dados->>'origem');
    nome:=btrim(dados->>'nome');
    if bruto is null or octet_length(bruto)>3000000 or canal is distinct from 'canal_homologacao'
       or coalesce(length(nome),0) not between 1 and 240 or nome ~ '[[:cntrl:]]' then
      raise exception 'Envie o arquivo CNAB original e informe o canal de homologação';
    end if;
    eventos:=ailos_privado.cnab_retorno(bruto,cfg);
    if exists (select 1 from jsonb_array_elements(eventos) e
      where (e->>'data')::date>(statement_timestamp() at time zone 'America/Sao_Paulo')::date
        or (e->>'ocorrencia' in ('06','17') and (e->>'pago_centavos')::bigint<=0)
    ) then raise exception 'Data ou valor da ocorrência bancária inválido'; end if;
    select count(*),count(b.id),min(b.ambiente)
    into n,identificados,ambiente_retorno
    from jsonb_array_elements(eventos) e
    left join ailos_privado.boletos b on b.nosso_numero=e->>'nosso_numero'
      and b.estado<>'Reservado' and b.snapshot->>'documento'=e->>'documento'
      and (b.snapshot->>'vencimento')::date=(e->>'vencimento')::date
      and (b.snapshot->>'valor')::numeric*100=(e->>'valor_centavos')::numeric
      and (b.snapshot->'pagador'->>'cpf_cnpj')::numeric=(e->>'cpf_cnpj')::numeric;
    if n<>identificados or exists (
      select 1 from jsonb_array_elements(eventos) e
      join ailos_privado.boletos b on b.nosso_numero=e->>'nosso_numero' where b.ambiente<>'homologacao'
    ) or ambiente_retorno is distinct from 'homologacao'
    then raise exception 'Retorno tem títulos divergentes, reservados ou fora da homologação'; end if;

    arquivo_hash:=encode(sha256(convert_to(bruto,'UTF8')),'hex');
    select jsonb_agg(jsonb_build_array(b.id,b.estado,b.ocorrencia,b.motivos,
      (select jsonb_agg(x.chave order by x.chave) from ailos_privado.eventos x where x.boleto_id=b.id))
      order by b.id)
    into estado_previa from ailos_privado.boletos b
    where b.nosso_numero in (select e->>'nosso_numero' from jsonb_array_elements(eventos) e);
    revisao:=encode(sha256(convert_to(jsonb_build_array(arquivo_hash,nome,canal,ambiente_retorno,
      eventos,estado_previa)::text,'UTF8')),'hex');
    select * into anterior from ailos_privado.retornos where hash=arquivo_hash;
    if found and (anterior.arquivo is distinct from bruto or anterior.origem is distinct from canal) then
      raise exception 'Este hash pertence a um retorno anterior sem a mesma procedência verificada. Confira o histórico.';
    end if;
    if acao='previa_retorno' then
      if anterior.hash is null then perform ailos_privado.conferir_ordem_retorno(eventos); end if;
      return jsonb_build_object('eventos',eventos,'ambiente',ambiente_retorno,'revisao',revisao);
    end if;
    revisao_atual:=dados->>'revisao';
    if revisao is distinct from revisao_atual and not coalesce(
      anterior.nome=nome and anterior.revisao_previa=revisao_atual,false
    ) then raise exception using errcode='40001',message='Refaça a conferência do retorno antes de importar'; end if;
    if anterior.hash is not null then
      return anterior.resultado||'{"repetido":true}'::jsonb;
    end if;
    perform ailos_privado.conferir_ordem_retorno(eventos);
    select array_agg(distinct chave) into novos_eventos
    from jsonb_array_elements(eventos) item
    join ailos_privado.boletos b on b.nosso_numero=item->>'nosso_numero'
    cross join lateral (select ailos_privado.cnab_chave_evento(b.id,item)) ch(chave)
    where not exists (select 1 from ailos_privado.eventos e where e.chave=ch.chave);
    -- Homologação não grava nem abre autorização de escrita em Recebimentos.
    resultado:=ailos_privado.operar_v3('retorno',jsonb_build_object('hash',arquivo_hash,'nome',nome,
      'ambiente',ambiente_retorno,'eventos',eventos));
    update ailos_privado.retornos set origem=canal,arquivo=bruto,revisao_previa=revisao
    where hash=arquivo_hash;
    update ailos_privado.eventos e set retorno_hash=arquivo_hash
    where e.chave=any(novos_eventos);
    return resultado;
  end if;

  return ailos_privado.operar_v3(acao,dados);
end $$;

revoke all on function public.financeiro_ailos(text,jsonb) from public,anon;
grant execute on function public.financeiro_ailos(text,jsonb) to authenticated;
revoke all on function
  ailos_privado.operar(text,jsonb), ailos_privado.operar_v2(text,jsonb), ailos_privado.operar_v3(text,jsonb),
  ailos_privado.cnab_texto(text,integer), ailos_privado.cnab_num(text,integer),
  ailos_privado.cnab_dv(text,integer), ailos_privado.cnab_conta(jsonb),
  ailos_privado.cnab_documento_valido(text), ailos_privado.cnab_remessa(jsonb),
  ailos_privado.cnab_data(text,boolean), ailos_privado.cnab_retorno(text,jsonb),
  ailos_privado.cnab_chave_evento(uuid,jsonb), ailos_privado.conferir_ordem_retorno(jsonb)
from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
