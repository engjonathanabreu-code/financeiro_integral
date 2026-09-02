/* Integral Financeiro V32 — ordenação por qualquer coluna na listagem de Contas */
(function(){
  'use strict';

  const getText = (cell) => (cell?.innerText || cell?.textContent || '').trim();

  function parseBRMoney(value){
    const text=String(value||'').replace(/\s/g,'');
    if(!/R\$|^-?[\d.]+,\d{2}$/.test(text)) return null;
    const n=Number(text.replace(/R\$/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:null;
  }

  function parseBRDate(value){
    const m=String(value||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(!m) return null;
    const t=Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]));
    return Number.isFinite(t)?t:null;
  }

  function sortableValue(text){
    const money=parseBRMoney(text);
    if(money!==null) return {type:'number',value:money};
    const date=parseBRDate(text);
    if(date!==null) return {type:'number',value:date};
    const numeric=Number(String(text).replace(',','.'));
    if(text!=='' && Number.isFinite(numeric) && /^-?\d+(?:[.,]\d+)?$/.test(text)) return {type:'number',value:numeric};
    return {type:'text',value:String(text||'').toLocaleLowerCase('pt-BR')};
  }

  function compare(a,b,direction){
    const av=sortableValue(a), bv=sortableValue(b);
    let result;
    if(av.type==='number' && bv.type==='number') result=av.value-bv.value;
    else result=String(av.value).localeCompare(String(bv.value),'pt-BR',{numeric:true,sensitivity:'base'});
    return direction==='asc'?result:-result;
  }

  function enhanceAccountsTable(){
    const table=document.querySelector('#content .table-wrap table.table');
    if(!table || table.dataset.accountsSortable==='true') return;
    const tbody=table.tBodies?.[0];
    const headers=[...(table.tHead?.rows?.[0]?.cells||[])];
    if(!tbody || !headers.length) return;

    table.dataset.accountsSortable='true';
    let sortIndex=-1;
    let sortDirection='asc';

    headers.forEach((th,index)=>{
      const label=getText(th);
      if(!label) return;

      th.style.cursor='pointer';
      th.style.userSelect='none';
      th.setAttribute('role','button');
      th.setAttribute('tabindex','0');
      th.setAttribute('aria-sort','none');
      th.title=`Ordenar por ${label}`;

      const original=th.innerHTML;
      th.innerHTML=`<span style="display:inline-flex;align-items:center;gap:6px">${original}<span data-sort-icon aria-hidden="true" style="font-size:11px;opacity:.45">↕</span></span>`;

      const doSort=()=>{
        const rows=[...tbody.rows].filter(row=>!row.querySelector('.empty'));
        if(rows.length<2) return;

        sortDirection=(sortIndex===index && sortDirection==='asc')?'desc':'asc';
        sortIndex=index;

        rows.sort((ra,rb)=>compare(getText(ra.cells[index]),getText(rb.cells[index]),sortDirection));
        rows.forEach(row=>tbody.appendChild(row));

        headers.forEach((header,i)=>{
          const icon=header.querySelector('[data-sort-icon]');
          const active=i===sortIndex;
          header.setAttribute('aria-sort',active?(sortDirection==='asc'?'ascending':'descending'):'none');
          if(icon){
            icon.textContent=active?(sortDirection==='asc'?'▲':'▼'):'↕';
            icon.style.opacity=active?'1':'.45';
          }
        });
      };

      th.addEventListener('click',doSort);
      th.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();doSort();}
      });
    });
  }

  const oldAccounts=typeof accounts==='function'?accounts:null;
  if(!oldAccounts) return;

  const wrapped=function(){
    const result=oldAccounts.apply(this,arguments);
    requestAnimationFrame(enhanceAccountsTable);
    return result;
  };

  try{ accounts=wrapped; }catch{}
  window.accounts=wrapped;
})();
