/* Integral Financeiro — regras compartilhadas da DRE gerencial.
   Usado no navegador (DRE e Agente Financeiro) e no servidor
   (lib/financial-consultant.js), para que as duas telas classifiquem
   os lançamentos exatamente do mesmo jeito. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.IntegralDREShared=api;
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toUpperCase();

/* Linhas analíticas. sign: +1 receita, -1 dedução/custo/despesa. */
const LINES=[
  {id:'rec_boletos',label:'Boletos de clientes (REURB)',group:'rb',sign:1},
  {id:'rec_publicos',label:'Contratos públicos (prefeituras)',group:'rb',sign:1},
  {id:'rec_privados',label:'Contratos privados e avulsos',group:'rb',sign:1},
  {id:'rec_outras',label:'Outras receitas',group:'rb',sign:1},
  {id:'ded_impostos',label:'Simples Nacional e impostos sobre receita',group:'ded',sign:-1},
  {id:'ded_distratos',label:'Distratos e devoluções',group:'ded',sign:-1},
  {id:'csp_terceiros',label:'Terceiros, técnicos e comissões',group:'csp',sign:-1},
  {id:'csp_viagens',label:'Viagens, combustível e locação',group:'csp',sign:-1},
  {id:'csp_art',label:'ART, registros e cartórios',group:'csp',sign:-1},
  {id:'dop_pessoal',label:'Pessoal e encargos (folha, FGTS, INSS, benefícios)',group:'dop',sign:-1},
  {id:'dop_admin',label:'Administrativas e estrutura',group:'dop',sign:-1},
  {id:'dop_gerais',label:'Cartão de crédito e despesas gerais',group:'dop',sign:-1},
  {id:'fin_tarifas',label:'Tarifas e despesas bancárias',group:'fin',sign:-1},
  {id:'fin_emprestimos',label:'Empréstimos e consórcios',group:'fin',sign:-1},
  {id:'investimentos',label:'Investimentos (drone, equipamentos, imobilizado)',group:'inv',sign:-1},
  {id:'socios',label:'Retiradas e distribuição aos sócios',group:'soc',sign:-1}
];
const LINE=Object.fromEntries(LINES.map(l=>[l.id,l]));
const GROUPS={rb:'RECEITA OPERACIONAL BRUTA',ded:'(−) DEDUÇÕES DA RECEITA',csp:'(−) CUSTOS DOS SERVIÇOS PRESTADOS',dop:'(−) DESPESAS OPERACIONAIS',fin:'(−) RESULTADO FINANCEIRO',inv:'(−) INVESTIMENTOS',soc:'(−) DISTRIBUIÇÃO AOS SÓCIOS'};
/* Estrutura exibida: grupos, linhas e subtotais acumulados. */
const LAYOUT=[
  {group:'rb'},
  {group:'ded'},{total:'rl',label:'= RECEITA LÍQUIDA',groups:['rb','ded']},
  {group:'csp'},{total:'lb',label:'= LUCRO BRUTO',groups:['rb','ded','csp'],margin:true},
  {group:'dop'},{total:'ro',label:'= RESULTADO OPERACIONAL (EBITDA)',groups:['rb','ded','csp','dop'],margin:true},
  {group:'fin'},{total:'rl2',label:'= RESULTADO LÍQUIDO DO PERÍODO',groups:['rb','ded','csp','dop','fin'],margin:true,strong:true},
  {group:'inv'},{group:'soc'},{total:'caixa',label:'= GERAÇÃO DE CAIXA APÓS INVESTIMENTOS E SÓCIOS',groups:['rb','ded','csp','dop','fin','inv','soc'],strong:true}
];

/* Classificação automática por natureza + descrição + categoria. */
function classify(r){
  const kind=norm(r.kind),text=`${kind} | ${norm(r.description)} | ${norm(r.category)}`;
  if(r.direction==='Entrada'){
    if(/PARCELAD|COBRANCA|BOLETO|REURB/.test(text))return 'rec_boletos';
    if(/CONTRATOS PUBLICOS|PREFEITURA|MUNICIPIO|\bPM\b/.test(text))return 'rec_publicos';
    if(/CONTRATOS PRIVADOS|AVULSA/.test(text))return 'rec_privados';
    return 'rec_outras';
  }
  if(/RETIRADA|DISTRIBUI|SOCIO|PRO-?LABORE|DESPESAS PESSOAIS/.test(kind))return 'socios';
  if(/EMPRESTIMO|FINANCIAMENTO/.test(kind))return 'fin_emprestimos';
  if(/TARIFA/.test(kind))return 'fin_tarifas';
  if(/FOLHA/.test(kind))return 'dop_pessoal';
  if(/\bART\b/.test(kind))return 'csp_art';
  if(/COMBUST/.test(kind))return 'csp_viagens';
  if(/RETIRADA|DISTRIBUICAO DE LUCRO|PRO-?LABORE|\bSOCIOS?\b/.test(text))return 'socios';
  if(/EMPREST|BNDES|BADESC|CONSORC|PARC\.? ?EMP|FINANCIAMENTO/.test(text))return 'fin_emprestimos';
  if(/TARIFA|DESP.* BANCARI|ENCARGOS? CART|\bIOF\b|JUROS|DB\.? COTAS/.test(text))return 'fin_tarifas';
  if(/SIMPLES|PGDAS|\bDAS\b|ICMS|\bISS\b|ISSQN/.test(text))return 'ded_impostos';
  if(/DISTRATO|DEVOLUC|ESTORNO/.test(text))return 'ded_distratos';
  if(/FOLHA|SALARI|BONUS|BONIFIC|FGTS|INSS|UNIMED|PLANO DE SAUDE|ADMISSIONAL|FERIAS|RESCIS|SINDICATO|SEGURANCA DO TRABALHO|\bRH\b/.test(text))return 'dop_pessoal';
  if(/SEGURO/.test(text))return 'dop_admin';
  if(/\bART\b|REGISTRO DE IMOV|CARTOR|EXECUCAO PROCESS/.test(text))return 'csp_art';
  if(/COMBUST|POSTO|GASOLINA|VIAGEM|HOSPEDAG|AIRBNB|HOTEL|LOCALIZA|LOCACAO|PEDAGIO|PASSAGEM/.test(text))return 'csp_viagens';
  if(/TERCEIR|AUXILIAR|TOPOGRAF|COMISS|TECNICO|VENDEDOR/.test(text))return 'csp_terceiros';
  if(/MARKETING|ANUNCIO|GOOGLE|IMPULSIONAMENTO|PUBLICACAO/.test(text))return 'dop_admin';
  if(/DRONE|IMOBILIZ|COMPUTADOR|EQUIPAMENTO|INVESTIMENTO/.test(text))return 'investimentos';
  if(/CARTAO|FATURA/.test(text))return 'dop_gerais';
  if(/DESPESA FIXA|CONSELHO|ALUGUEL|CONTAB|HONORARIO|TELEF|\bTIM\b|CLARO|VIVO|INTERNET|ENERGIA|CELESC|AGUA|CASAN|PROCOB|SOFTWARE|CREA|\bCAU\b|LIMPEZA|FAXINA|MATERIAL|PAPELARIA|MERCADO|ESCRITORIO|IPVA|LICENCIAMENTO|MANUTENC|CORREIOS|ALVARA|TAXA|MULTA|CUSTOS FIXOS/.test(text))return 'dop_admin';
  return 'dop_gerais';
}

/* Previsões do módulo Planejamento: receitas planejadas são lotes de boletos
   REURB; recebimentos do ERP são contratos; despesas seguem a regra geral. */
function classifyPlan(r){
  if(r.direction==='Entrada'){
    if(r.source==='Planejamento')return 'rec_boletos';
    const t=norm(`${r.origin} ${r.category||''}`);
    if(/REGISTRAL|PRIVAD|FAMILIA|LTDA|S\.?A\.?\b/.test(t))return 'rec_privados';
    return 'rec_publicos';
  }
  if(r.source==='RH')return 'dop_pessoal';
  return classify({direction:'Saída',kind:r.category||'',description:r.origin||'',category:r.category||''});
}

return {LINES,LINE,GROUPS,LAYOUT,classify,classifyPlan,norm};
});
