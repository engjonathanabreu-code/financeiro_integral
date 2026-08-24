/* Sincronizações automáticas V6 */
(function(){
  const baseSave=save;
  save=function(){
    db.docs=db.docs||[];
    (db.budgetExpenses||[]).forEach(e=>{
      if(!e.file||e.fiscalDocId||String(e.date||'').slice(0,7)!==new Date().toISOString().slice(0,7)) return;
      const b=(db.budgetRecords||[]).find(x=>x.id===e.budgetId);
      const id=typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999);
      db.docs.unshift({id,name:e.file.name,type:'Comprovante',supplier:e.origin||'Não identificado',date:e.date,cat:'Gasto de orçamento',sector:b?.sector||'Administrativo',value:+e.value||0,status:e.duplicate?'Revisar IA':'Confirmado',source:'Orçamento'});
      e.fiscalDocId=id;
    });
    return baseSave();
  };
})();
