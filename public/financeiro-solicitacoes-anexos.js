/* Anexos da mesma solicitação, com reserva e confirmação do servidor. */
(function(){
'use strict';

const BUCKET='financeiro-solicitacoes';
const LIMIT=20*1024*1024;
const TYPES=new Set(['application/pdf','image/png','image/jpeg']);
const attempts=new Map();
let actor=null;

function element(tag,text){
  const node=document.createElement(tag);
  if(text)node.textContent=text;
  return node;
}

async function session(){
  const sb=window.IntegralERP?.sb;
  if(!sb)throw new Error('Conexão indisponível.');
  const {data,error}=await sb.auth.getSession();
  const uid=data?.session?.user?.id;
  if(error||!uid)throw new Error('Entre novamente para acessar os anexos.');
  if(actor!==uid)attempts.clear();
  actor=uid;
  return {sb,uid:actor};
}

async function rpc(sb,method,args){
  const {data,error}=await sb.rpc(method,args);
  if(error)throw error;
  return data;
}

async function send(sb,request,attempt){
  const file=attempt.file;
  const reserved=await rpc(sb,'financeiro_reservar_anexo_solicitacao',{
    p_id:request,p_arquivo:attempt.id,p_nome:file.name,p_mime:file.type,p_tamanho:file.size
  });
  if(reserved?.id!==attempt.id||!reserved.path)throw new Error('O servidor ainda não confirmou a reserva.');
  if(!reserved.confirmedAt){
    const {error}=await sb.storage.from(BUCKET).upload(reserved.path,file,{
      contentType:file.type,upsert:false,cacheControl:'0'
    });
    if(error&&String(error.statusCode)!=='409'&&error.error!=='Duplicate')throw error;
  }
  const confirmed=await rpc(sb,'financeiro_confirmar_anexo_solicitacao',{p_id:request,p_arquivo:attempt.id});
  if(confirmed?.id!==attempt.id||!confirmed.confirmedAt)throw new Error('O servidor ainda não confirmou o anexo.');
}

function mount(dialog,request,canAttach,onSaved){
  const requestId=String(request.id);
  const body=dialog.querySelector('.modal-body');
  if(!body)return;
  const section=element('section');
  section.className='invoice-attachments field';
  const heading=element('h3','Anexos');
  const list=element('ul');
  const status=element('p','Carregando anexos…');
  status.setAttribute('role','status');
  section.append(heading,list,status);
  body.append(section);

  async function download(file,button){
    button.disabled=true;
    try{
      const {sb,uid}=await session();
      const {data,error}=await sb.storage.from(BUCKET).download(file.path);
      if(error||!data)throw error||new Error('O arquivo não está disponível.');
      if((await session()).uid!==uid||!section.isConnected)return;
      const url=URL.createObjectURL(data);
      const anchor=element('a');
      anchor.href=url;
      anchor.download=file.name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      status.textContent='';
    }catch(error){status.textContent='Falha ao abrir o anexo. '+error.message}
    finally{button.disabled=false}
  }

  async function refresh(){
    const {sb,uid}=await session();
    const files=await rpc(sb,'financeiro_listar_anexos_solicitacao',{p_id:requestId});
    if((await session()).uid!==uid||!section.isConnected)return;
    if(!Array.isArray(files))throw new Error('O servidor não retornou a lista de anexos.');
    list.replaceChildren(...files.map(file=>{
      const item=element('li'),button=element('button',file.name);
      button.className='btn ghost small';
      button.type='button';
      button.setAttribute('aria-label','Baixar '+file.name);
      button.onclick=()=>download(file,button);
      item.append(button);
      return item;
    }));
    status.textContent=files.length?'':'Nenhum anexo.';
  }

  if(canAttach){
    const form=element('form');
    const label=element('label','Selecionar PDF, PNG ou JPEG (até 20 MB)');
    const input=element('input');
    input.type='file';
    input.accept=[...TYPES].join(',');
    label.append(input);
    const button=element('button','Anexar documento');
    button.type='submit';
    button.className='btn secondary small';
    form.append(label,button);
    section.append(form);
    form.onsubmit=async event=>{
      event.preventDefault();
      button.disabled=input.disabled=true;
      try{
        const {sb,uid}=await session();
        const key=JSON.stringify([uid,requestId]);
        let attempt=attempts.get(key);
        const file=input.files[0];
        if(file&&file!==attempt?.file){
          if(!TYPES.has(file.type)||file.size<1||file.size>LIMIT)throw new Error('Selecione um PDF, PNG ou JPEG válido de até 20 MB.');
          attempt={id:crypto.randomUUID(),file};
          attempts.set(key,attempt);
        }
        if(!attempt)throw new Error('Selecione um arquivo.');
        status.textContent='Enviando '+attempt.file.name+'…';
        await send(sb,requestId,attempt);
        attempts.delete(key);
        if((await session()).uid!==uid||!section.isConnected)return;
        input.value='';
        status.textContent='Anexo confirmado pelo servidor.';
        button.textContent='Anexar documento';
        try{await refresh()}
        catch{status.textContent='Anexo confirmado. Reabra a solicitação para atualizar a lista.'}
        if(!status.textContent)status.textContent='Anexo confirmado pelo servidor.';
        if(onSaved)onSaved();
      }catch(error){status.textContent='Anexo não confirmado. '+error.message}
      finally{button.disabled=input.disabled=false}
    };
    void session().then(({uid})=>{
      const attempt=attempts.get(JSON.stringify([uid,requestId]));
      if(attempt&&section.isConnected)button.textContent='Tentar novamente: '+attempt.file.name;
    }).catch(()=>{});
  }

  void refresh().catch(error=>{status.textContent='Não foi possível carregar os anexos. '+error.message});
}

window.IntegralFinanceRequestAttachments={mount};
})();
