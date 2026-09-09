(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const digits=s=>String(s||'').replace(/\D/g,'');
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fileData=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
function close(){document.querySelector('#recebSmartReport')?.remove()}
function modal(){close();const d=document.createElement('div');d.id='recebSmartReport';d.className='modal-backdrop';d.innerHTML=`<section class="modal"><header class="modal-head"><h3>Importar relatório de pagamentos</h3><button class="btn icon ghost" data-close>×</button></header><div class="modal-body"><div class="form-grid"><div class="field full"><label>Relatório PDF</label><input id="smartPayFile" type="file" accept="application/pdf"></div><div class="field full"><div class="notice">A conciliação usa código/documento, CPF/CNPJ e também <b>nome + vencimento + valor nominal</b>. Juros e multa são incorporados ao valor realizado da parcela.</div></div><div id="smartPayStatus" class="field full"></div></div></div><footer class="modal-foot"><button class="btn ghost" data-close>Fechar</button><button class="btn" id="smartPayImport">Importar</button></footer></section>`;document.body.appendChild(d);d.querySelectorAll('[data-close]').forEach(x=>x.onclick=close);d.querySelector('#smartPayImport').onclick=run}
async function run(){const file=document.querySelector('#smartPayFile')?.files?.[0],status=document.querySelector('#smartPayStatus'),btn=document.querySelector('#smartPayImport');if(!file)return alert('Selecione o PDF.');btn.disabled=true;status.textContent='Lendo relatório e conciliando parcelas...';try{
 const data=await fileData(file),rr=await fetch('/api/ai-receivables',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:data,fileName:file.name,mode:'payments'})}),j=await rr.json();if(!rr.ok||!j.ok)throw new Error(j.details||j.error||'Falha na leitura do relatório');
 const [cr,pr]=await Promise.all([sb.from('fin_receb_clientes').select('*'),sb.from('fin_receb_parcelas').select('*')]);if(cr.error)throw cr.error;if(pr.error)throw pr.error;const clients=cr.data||[],parcels=pr.data||[];let ok=0,pending=0,adjusted=0;const misses=[];
 for(const x of j.entries||[]){let p=null,c=null;const doc=norm(x.documento),nn=digits(x.nosso_numero),cpf=digits(x.cpf_cnpj),name=norm(x.pagador),due=String(x.vencimento||'').slice(0,10),nom=Number(x.valor_nominal||0),paid=Number(x.valor_liquidado||nom||0);
  if(nn)p=parcels.find(z=>digits(z.nosso_numero)===nn);
  if(!p&&doc)p=parcels.find(z=>norm(z.documento)===doc);
  if(!p&&doc){c=clients.find(z=>norm(z.codigo)===doc);if(c)p=parcels.find(z=>z.cliente_id===c.id&&(!due||z.vencimento===due));}
  if(!p&&cpf){c=clients.find(z=>digits(z.cpf_cnpj)===cpf);if(c)p=parcels.find(z=>z.cliente_id===c.id&&(!due||z.vencimento===due)&&z.status!=='Pago');}
  if(!p&&name){const exact=clients.filter(z=>norm(z.nome)===name);if(exact.length===1){c=exact[0];p=parcels.find(z=>z.cliente_id===c.id&&z.vencimento===due&&Math.abs(Number(z.valor_previsto||0)-nom)<0.03)||parcels.find(z=>z.cliente_id===c.id&&z.vencimento===due);}}
  if(!p&&name){const near=clients.filter(z=>{const n=norm(z.nome);return n&&name&&(n.startsWith(name)||name.startsWith(n))});if(near.length===1){c=near[0];p=parcels.find(z=>z.cliente_id===c.id&&z.vencimento===due&&Math.abs(Number(z.valor_previsto||0)-nom)<0.03);}}
  if(p){const diff=paid-nom,upd={status:'Pago',pago_em:x.pagamento||null,valor_liquidado:paid,diferenca:diff,nosso_numero:p.nosso_numero||x.nosso_numero||null,documento:p.documento||x.documento||null};if(Math.abs(diff)>0.009){upd.valor_previsto=paid;adjusted++;}const ur=await sb.from('fin_receb_parcelas').update(upd).eq('id',p.id);if(ur.error){pending++;misses.push(x.pagador||x.documento||'registro')}else ok++;
  }else{pending++;misses.push(x.pagador||x.documento||'registro')}
 }
 status.innerHTML=`<div class="notice ok"><b>${ok}</b> parcela(s) marcada(s) como paga(s). <b>${adjusted}</b> parcela(s) tiveram o valor do mês recalibrado por juros/multa. <b>${pending}</b> ficaram pendentes para conferência.${misses.length?`<br><small>Não conciliados: ${misses.slice(0,8).join(', ')}${misses.length>8?'…':''}</small>`:''}</div>`;btn.disabled=false;
 }catch(e){status.innerHTML=`<div class="notice danger">${String(e.message||e)}</div>`;btn.disabled=false}}
document.addEventListener('click',e=>{const b=e.target.closest?.('#importReport');if(!b)return;e.preventDefault();e.stopImmediatePropagation();modal()},true);
})();