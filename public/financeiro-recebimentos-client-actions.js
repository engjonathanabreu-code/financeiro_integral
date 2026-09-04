(function(){
'use strict';

function reopenMunicipioWhenDeletionFinishes(municipioNome){
  const started=Date.now();
  const timer=setInterval(()=>{
    if(Date.now()-started>12000){clearInterval(timer);return;}
    if(document.querySelector('#recebModal')) return;
    const rows=[...document.querySelectorAll('[data-muni]')];
    const row=rows.find(r=>{
      const nome=(r.querySelector('td b')?.textContent||'').trim();
      return nome===municipioNome;
    });
    if(row){
      clearInterval(timer);
      row.click();
    }
  },120);
}

function enhanceMunicipioClientTable(){
  const modal=document.querySelector('#recebModal');
  if(!modal) return;

  const title=(modal.querySelector('.modal-head h3')?.textContent||'').trim();
  if(!title.endsWith('— clientes')) return;
  const municipioNome=title.replace(/\s*—\s*clientes\s*$/i,'').trim();

  const clientButtons=[...modal.querySelectorAll('button[data-client]')];
  clientButtons.forEach(openBtn=>{
    const cell=openBtn.closest('td');
    if(!cell || cell.dataset.actionsReady==='1') return;
    cell.dataset.actionsReady='1';

    openBtn.textContent='Abrir';
    openBtn.style.marginRight='6px';

    const editBtn=document.createElement('button');
    editBtn.className='btn small secondary';
    editBtn.textContent='Editar';
    editBtn.style.marginRight='6px';
    editBtn.addEventListener('click',ev=>{
      ev.stopPropagation();
      openBtn.click();
      setTimeout(()=>document.querySelector('#editC')?.click(),0);
    });

    const deleteBtn=document.createElement('button');
    deleteBtn.className='btn small danger';
    deleteBtn.textContent='Excluir';
    deleteBtn.addEventListener('click',ev=>{
      ev.stopPropagation();
      openBtn.click();
      setTimeout(()=>{
        const del=document.querySelector('#delC');
        if(!del) return;
        del.click();
        reopenMunicipioWhenDeletionFinishes(municipioNome);
      },0);
    });

    cell.appendChild(editBtn);
    cell.appendChild(deleteBtn);
  });
}

const observer=new MutationObserver(enhanceMunicipioClientTable);
observer.observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('click',()=>setTimeout(enhanceMunicipioClientTable,0));
window.addEventListener('load',enhanceMunicipioClientTable);
})();
