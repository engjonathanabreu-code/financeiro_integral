// Simula financeiro_estado_modulos e a RPC financeiro_salvar_modulo (revisão esperada) para testes
// do navegador. A revisão sobe sozinha quando o conteúdo de server[chave] muda, inclusive quando o
// teste altera o objeto diretamente para simular outro usuário.
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

function fakeModules(server,{beforeWrite}={}){
 const seen=new Map();
 const rev=k=>{const j=JSON.stringify(server[k]),s=seen.get(k);if(!s){seen.set(k,{j,r:1});return 1}if(s.j!==j){s.j=j;s.r++}return s.r};
 const rows=keys=>({data:Object.keys(server).filter(k=>!keys||keys.includes(k)).map(chave=>({chave,dados:copy(server[chave]),revisao:rev(chave)})),error:null});
 const stale=(k,r)=>r==null?own(server,k):rev(k)!==r;
 const conflict=k=>({data:{status:'conflito',revisao:rev(k),dados:copy(server[k])},error:null});
 async function save({p_chave:k,p_dados:dados,p_revisao:r}){
  if(stale(k,r))return conflict(k);
  const error=await beforeWrite?.({chave:k,dados:copy(dados)});
  if(error)return {data:null,error};
  if(stale(k,r))return conflict(k);   // a gravação é atômica: confere de novo no "commit"
  server[k]=copy(dados);
  return {data:{status:'salvo',revisao:rev(k),dados:copy(dados)},error:null};
 }
 return {rows,save,rev};
}
module.exports={fakeModules,copy};
