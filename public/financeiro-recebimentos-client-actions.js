(function(){
'use strict';

function enhanceMunicipioClientTable(){
  const modal=document.querySelector('#recebModal');
  if(!modal) return;

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
      setTimeout(()=>document.querySelector('#delC')?.click(),0);
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
