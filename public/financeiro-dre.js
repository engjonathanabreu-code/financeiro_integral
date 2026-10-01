/* Integral Financeiro — DRE gerencial (regime de caixa).
   Alimentada pelo Fluxo de Caixa (lançamentos manuais, extrato, contas pagas
   e orçamentos) e por Recebimentos (boletos liquidados). Os meses já fechados
   na planilha "INTEGRAL 2026 Fluxo de caixa ANUAL" (jul–ago/2026) vêm como
   histórico embutido; em cada mês é possível escolher entre planilha e sistema.
   O previsto vem da mesma planilha e do Planejamento; a aba Previsto × Realizado
   aponta os furos por linha e mês.
   Reclassificações feitas na tela ficam em db.dreOverrides e não alteram o
   lançamento original. */
(function(){
'use strict';

const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const M=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const N=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const norm=window.IntegralDREShared.norm;
const DB=()=>{try{return db}catch{return window.db||{}}};
const persist=()=>{try{save()}catch{try{window.save?.()}catch{}}};
const isAdmin=()=>{try{return user?.role==='Administrador'}catch{return false}};
const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const monthKey=(y,i)=>`${y}-${String(i+1).padStart(2,'0')}`;

/* Linhas, grupos, estrutura e classificação vêm de financeiro-dre-shared.js. */
const SHARED=window.IntegralDREShared;
const {LINES,LINE,GROUPS,LAYOUT}=SHARED;

/* Histórico realizado da planilha (Entradas - R e Saídas - R). */
const SEED_SOURCE='Planilha Fluxo de Caixa 2026';
const SEED=[
["2026-07", "rec_boletos", "Boletos", 87159.64],
["2026-07", "rec_privados", "Familia Paulista", 13000],
["2026-08", "rec_boletos", "Boletos", 86989.82],
["2026-08", "rec_publicos", "Iomere", 11000],
["2026-08", "rec_publicos", "Paulo Lopes", 1800],
["2026-08", "rec_privados", "Lucian Registral", 8346.66],
["2026-08", "rec_publicos", "Aurora", 8000],
["2026-08", "rec_publicos", "Anitapolis", 25000],
["2026-07", "dop_pessoal", "Admissional", 60],
["2026-07", "dop_admin", "Aluguel", 1650],
["2026-07", "dop_admin", "Contabilidade", 1461.26],
["2026-07", "dop_admin", "Crea Anualidade", 412.66],
["2026-07", "csp_art", "Crea/Cau Art", 503.44],
["2026-07", "dop_admin", "Curso Drone", 87.81],
["2026-07", "dop_gerais", "Desp.Diversas", 124],
["2026-07", "csp_art", "Execução Processos", 98.34],
["2026-07", "dop_admin", "Ipva", 246.06],
["2026-07", "dop_admin", "Licenciamento", 149.37],
["2026-07", "dop_admin", "Manutenção Carro", 105],
["2026-07", "dop_admin", "Manutenção Software", 505],
["2026-07", "dop_admin", "Marketing", 414.6],
["2026-07", "dop_admin", "Material Escritório", 238.79],
["2026-07", "dop_admin", "Mensalidade Software", 1136.9],
["2026-07", "dop_admin", "Mercado", 539.32],
["2026-07", "dop_admin", "Papelaria", 25.2],
["2026-07", "dop_admin", "Procob", 65.06],
["2026-07", "csp_art", "Registro De Imoveis", 457.35],
["2026-07", "dop_admin", "Seguros", 500.96],
["2026-07", "dop_admin", "Telefone", 94.99],
["2026-07", "investimentos", "Drone", 2600],
["2026-07", "investimentos", "Componentes p/ computador (cartão)", 2488.56],
["2026-07", "investimentos", "Imobilizado", 146.71],
["2026-07", "investimentos", "Computador", 1270.21],
["2026-07", "csp_terceiros", "Auxiliar Topografia", 800],
["2026-07", "ded_distratos", "Distratos", 450],
["2026-07", "csp_terceiros", "Serviços De Terceiros", 1040],
["2026-07", "csp_terceiros", "Comissão", 1350],
["2026-07", "fin_emprestimos", "Emprestimos", 11216.44],
["2026-07", "fin_emprestimos", "Consorcios", 737.67],
["2026-07", "ded_impostos", "PGDAS - Simples Nacional", 628.68],
["2026-07", "dop_pessoal", "Fgts", 160.84],
["2026-07", "dop_pessoal", "Inss", 334.94],
["2026-07", "csp_viagens", "Viagem Comercial", 4135.24],
["2026-07", "csp_viagens", "Viagem Tecnico", 3141.9],
["2026-07", "fin_tarifas", "Despesas Bancárias", 754.52],
["2026-07", "csp_art", "Desp.Cartorarias", 257.51],
["2026-07", "fin_tarifas", "Encargos Cartão", 16.79],
["2026-07", "dop_pessoal", "Folha De Pagamento", 26975],
["2026-07", "socios", "Distribuição p/ sócios", 69626],
["2026-07", "csp_terceiros", "Trabalho fora do orçamento — Benedito Novo", 855],
["2026-07", "csp_terceiros", "Trabalho fora do orçamento — CVA", 2429.38],
["2026-07", "socios", "Despesas pessoais (sócios)", 8585.49],
["2026-08", "dop_admin", "Aluguel", 1650],
["2026-08", "dop_admin", "Contabilidade", 1971.26],
["2026-08", "dop_admin", "Crea Anualidade", 412.66],
["2026-08", "csp_art", "Crea/Cau Art", 717.09],
["2026-08", "dop_admin", "Desp.Administrativas", 120],
["2026-08", "dop_gerais", "Desp.Diversas", 53],
["2026-08", "dop_admin", "Materiais P/ Computador", 355],
["2026-08", "dop_admin", "Material Escritório", 368.29],
["2026-08", "dop_admin", "Mercado", 567.57],
["2026-08", "dop_admin", "Procob", 65.06],
["2026-08", "csp_art", "Registro De Imoveis", 623.88],
["2026-08", "dop_admin", "Seguros", 500.96],
["2026-08", "dop_admin", "Taxas, Multas E Impostos", 136.98],
["2026-08", "dop_admin", "Telefone", 103.37],
["2026-08", "investimentos", "Drone", 2600],
["2026-08", "investimentos", "Componentes p/ computador (cartão)", 12633.23],
["2026-08", "ded_distratos", "Distratos", 450],
["2026-08", "csp_terceiros", "Serviços De Terceiros", 160],
["2026-08", "fin_emprestimos", "Emprestimos", 11318.53],
["2026-08", "fin_emprestimos", "Consorcios", 737.67],
["2026-08", "ded_impostos", "PGDAS - Simples Nacional", 2953.09],
["2026-08", "dop_pessoal", "Fgts", 285.73],
["2026-08", "dop_pessoal", "Inss", 454.37],
["2026-08", "csp_viagens", "Viagem Comercial", 256.41],
["2026-08", "csp_viagens", "Viagem Tecnico", 2326.67],
["2026-08", "fin_tarifas", "Despesas Bancárias", 985.54],
["2026-08", "csp_art", "Desp.Cartorarias", 402.12],
["2026-08", "dop_pessoal", "Folha De Pagamento", 840],
["2026-08", "dop_pessoal", "Bonus/Bonificação", 8100],
["2026-08", "socios", "Distribuição p/ sócios", 20709.99],
["2026-08", "csp_terceiros", "Trabalho fora do orçamento — Benedito Novo", 138.95],
["2026-08", "socios", "Despesas pessoais (sócios)", 5686.82]
];
const SEED_MONTHS=new Set(SEED.map(x=>x[0]));

const classify=SHARED.classify;

/* Previsto da mesma planilha: "Entradas - Previsão" e "Saídas - Previsto Geral",
   linha a linha. A distribuição aos sócios
   não tem previsão na planilha ("VER QUANTO É"). */
const PREV_SEED_SOURCE='Planilha — previsão 2026';
const PREV_SEED=[
["2026-07", "rec_boletos", "Boletos", 67750],
["2026-08", "rec_boletos", "Boletos", 60000],
["2026-09", "rec_boletos", "Boletos", 59000],
["2026-10", "rec_boletos", "Boletos", 58000],
["2026-11", "rec_boletos", "Boletos", 56000],
["2026-12", "rec_boletos", "Boletos", 51000],
["2026-08", "rec_publicos", "Ilhota", 4800],
["2026-09", "rec_publicos", "Ilhota", 4800],
["2026-10", "rec_publicos", "Ilhota", 4800],
["2026-11", "rec_publicos", "Ilhota", 4800],
["2026-12", "rec_publicos", "Ilhota", 4800],
["2026-08", "rec_privados", "Juliano", 5500],
["2026-09", "rec_privados", "Juliano", 5500],
["2026-10", "rec_privados", "Juliano", 5500],
["2026-11", "rec_privados", "Juliano", 5500],
["2026-12", "rec_privados", "Juliano", 5500],
["2026-07", "rec_publicos", "Iomerê/SC - consultoria", 5500],
["2026-08", "rec_publicos", "Iomerê/SC - consultoria", 5500],
["2026-09", "rec_publicos", "Iomerê/SC - consultoria", 5500],
["2026-10", "rec_publicos", "Iomerê/SC - consultoria", 5500],
["2026-11", "rec_publicos", "Iomerê/SC - consultoria", 5500],
["2026-12", "rec_publicos", "Iomerê/SC - consultoria", 5500],
["2026-07", "rec_publicos", "Aurora/SC - ETSA e Ortofoto", 8400],
["2026-08", "rec_publicos", "Aurora/SC - ETSA e Ortofoto", 8000],
["2026-10", "rec_publicos", "Aurora/SC - ETSA e Ortofoto", 8400],
["2026-08", "rec_publicos", "Anitápolis - ETSA e Ortofoto", 26000],
["2026-10", "rec_publicos", "Anitápolis - ETSA e Ortofoto", 6000],
["2026-11", "rec_publicos", "Anitápolis - ETSA e Ortofoto", 6000],
["2026-12", "rec_publicos", "Anitápolis - ETSA e Ortofoto", 6000],
["2026-07", "rec_publicos", "Imbuia - ETSA", 5000],
["2026-10", "rec_publicos", "Imbuia - ETSA", 12000],
["2026-07", "rec_privados", "Familia Paulista  ortofoto CVA", 15000],
["2026-07", "rec_publicos", "Paulo Lopes/SC - consultoria", 1800],
["2026-08", "rec_publicos", "Paulo Lopes/SC - consultoria", 1800],
["2026-09", "rec_publicos", "Paulo Lopes/SC - consultoria", 1800],
["2026-10", "rec_publicos", "Paulo Lopes/SC - consultoria", 1800],
["2026-11", "rec_publicos", "Paulo Lopes/SC - consultoria", 1800],
["2026-12", "rec_publicos", "Paulo Lopes/SC - consultoria", 1800],
["2026-08", "rec_privados", "Zanette", 7000],
["2026-09", "rec_privados", "Zanette", 7000],
["2026-10", "rec_privados", "Zanette", 7000],
["2026-11", "rec_privados", "Zanette", 7000],
["2026-12", "rec_privados", "Zanette", 7000],
["2026-07", "dop_admin", "Aluguel", 1650],
["2026-08", "dop_admin", "Aluguel", 1650],
["2026-09", "dop_admin", "Aluguel", 1650],
["2026-10", "dop_admin", "Aluguel", 1650],
["2026-11", "dop_admin", "Aluguel", 1650],
["2026-12", "dop_admin", "Aluguel", 1650],
["2026-07", "dop_admin", "Contabilidade", 900],
["2026-08", "dop_admin", "Contabilidade", 900],
["2026-09", "dop_admin", "Contabilidade", 900],
["2026-10", "dop_admin", "Contabilidade", 900],
["2026-11", "dop_admin", "Contabilidade", 900],
["2026-12", "dop_admin", "Contabilidade", 900],
["2026-07", "dop_admin", "Crea Anualidade", 412.77],
["2026-08", "dop_admin", "Crea Anualidade", 412.77],
["2026-09", "dop_admin", "Crea Anualidade", 412.77],
["2026-10", "dop_admin", "Crea Anualidade", 412.77],
["2026-07", "dop_admin", "Taxas, Multas E Impostos", 10],
["2026-08", "dop_admin", "Taxas, Multas E Impostos", 10],
["2026-09", "dop_admin", "Taxas, Multas E Impostos", 10],
["2026-10", "dop_admin", "Taxas, Multas E Impostos", 10],
["2026-11", "dop_admin", "Taxas, Multas E Impostos", 10],
["2026-12", "dop_admin", "Taxas, Multas E Impostos", 10],
["2026-07", "dop_admin", "Ipva", 246.06],
["2026-07", "dop_admin", "Seguro Drone", 187.65],
["2026-08", "dop_admin", "Seguro Drone", 187.65],
["2026-09", "dop_admin", "Seguro Drone", 187.65],
["2026-07", "dop_admin", "Marketing", 354.6],
["2026-08", "dop_admin", "Marketing", 354.6],
["2026-09", "dop_admin", "Marketing", 354.6],
["2026-10", "dop_admin", "Marketing", 354.6],
["2026-11", "dop_admin", "Marketing", 354.6],
["2026-07", "dop_admin", "Seguros", 313.34],
["2026-08", "dop_admin", "Seguros", 313.34],
["2026-09", "dop_admin", "Seguros", 313.34],
["2026-10", "dop_admin", "Seguros", 313.34],
["2026-11", "dop_admin", "Seguros", 313.34],
["2026-12", "dop_admin", "Seguros", 313.34],
["2026-07", "dop_admin", "Telefone", 109.99],
["2026-08", "dop_admin", "Telefone", 109.99],
["2026-09", "dop_admin", "Telefone", 109.99],
["2026-10", "dop_admin", "Telefone", 109.99],
["2026-11", "dop_admin", "Telefone", 109.99],
["2026-12", "dop_admin", "Telefone", 109.99],
["2026-07", "dop_admin", "Procob", 65.06],
["2026-08", "dop_admin", "Procob", 65.06],
["2026-09", "dop_admin", "Procob", 65.06],
["2026-10", "dop_admin", "Procob", 65.06],
["2026-11", "dop_admin", "Procob", 65.06],
["2026-12", "dop_admin", "Procob", 65.06],
["2026-07", "csp_viagens", "Combustível", 1000],
["2026-08", "csp_viagens", "Combustível", 1000],
["2026-09", "csp_viagens", "Combustível", 1000],
["2026-10", "csp_viagens", "Combustível", 1000],
["2026-11", "csp_viagens", "Combustível", 1000],
["2026-12", "csp_viagens", "Combustível", 1000],
["2026-07", "dop_gerais", "Desp.Diversas", 170.56],
["2026-07", "investimentos", "Drone", 2600],
["2026-08", "investimentos", "Drone", 2600],
["2026-09", "investimentos", "Drone", 2600],
["2026-10", "investimentos", "Drone", 2600],
["2026-11", "investimentos", "Drone", 2600],
["2026-12", "investimentos", "Drone", 2600],
["2026-07", "investimentos", "Imobilizado", 984.15],
["2026-08", "investimentos", "Imobilizado", 983.15],
["2026-09", "investimentos", "Imobilizado", 837.44],
["2026-10", "investimentos", "Imobilizado", 407.44],
["2026-11", "investimentos", "Imobilizado", 407.44],
["2026-12", "investimentos", "Imobilizado", 407.44],
["2026-07", "ded_distratos", "Distratos", 250],
["2026-08", "ded_distratos", "Distratos", 250],
["2026-09", "ded_distratos", "Distratos", 250],
["2026-07", "csp_terceiros", "Técnico (terceiro)", 3500],
["2026-08", "csp_terceiros", "Técnico (terceiro)", 3500],
["2026-09", "csp_terceiros", "Técnico (terceiro)", 3500],
["2026-10", "csp_terceiros", "Técnico (terceiro)", 3500],
["2026-11", "csp_terceiros", "Técnico (terceiro)", 3500],
["2026-12", "csp_terceiros", "Técnico (terceiro)", 3500],
["2026-07", "fin_emprestimos", "Emprestimos", 12000],
["2026-08", "fin_emprestimos", "Emprestimos", 12000],
["2026-09", "fin_emprestimos", "Emprestimos", 12000],
["2026-10", "fin_emprestimos", "Emprestimos", 12000],
["2026-11", "fin_emprestimos", "Emprestimos", 12000],
["2026-12", "fin_emprestimos", "Emprestimos", 12000],
["2026-07", "fin_emprestimos", "Consorcios", 737.67],
["2026-08", "fin_emprestimos", "Consorcios", 737.67],
["2026-09", "fin_emprestimos", "Consorcios", 737.67],
["2026-10", "fin_emprestimos", "Consorcios", 737.67],
["2026-11", "fin_emprestimos", "Consorcios", 737.67],
["2026-12", "fin_emprestimos", "Consorcios", 737.67],
["2026-07", "ded_impostos", "PGDAS - Simples Nacional", 4500],
["2026-08", "ded_impostos", "PGDAS - Simples Nacional", 4500],
["2026-09", "ded_impostos", "PGDAS - Simples Nacional", 4500],
["2026-10", "ded_impostos", "PGDAS - Simples Nacional", 4500],
["2026-11", "ded_impostos", "PGDAS - Simples Nacional", 4500],
["2026-12", "ded_impostos", "PGDAS - Simples Nacional", 4500],
["2026-07", "dop_pessoal", "Fgts", 290.52],
["2026-08", "dop_pessoal", "Fgts", 290.52],
["2026-09", "dop_pessoal", "Fgts", 738.52],
["2026-10", "dop_pessoal", "Fgts", 738.52],
["2026-11", "dop_pessoal", "Fgts", 1303.72],
["2026-12", "dop_pessoal", "Fgts", 1303.72],
["2026-07", "dop_pessoal", "Inss", 456.52],
["2026-08", "dop_pessoal", "Inss", 456.52],
["2026-09", "dop_pessoal", "Inss", 887.59],
["2026-10", "dop_pessoal", "Inss", 1196.19],
["2026-11", "dop_pessoal", "Inss", 1523.51],
["2026-12", "dop_pessoal", "Inss", 1523.51],
["2026-07", "dop_gerais", "Cartão de crédito", 5500],
["2026-08", "dop_gerais", "Cartão de crédito", 5500],
["2026-09", "dop_gerais", "Cartão de crédito", 5500],
["2026-10", "dop_gerais", "Cartão de crédito", 5500],
["2026-11", "dop_gerais", "Cartão de crédito", 5500],
["2026-12", "dop_gerais", "Cartão de crédito", 5500],
["2026-07", "csp_viagens", "Despesas De Viagem", 1080],
["2026-07", "fin_tarifas", "Despesas Bancárias", 500],
["2026-08", "fin_tarifas", "Despesas Bancárias", 500],
["2026-09", "fin_tarifas", "Despesas Bancárias", 500],
["2026-10", "fin_tarifas", "Despesas Bancárias", 500],
["2026-11", "fin_tarifas", "Despesas Bancárias", 500],
["2026-12", "fin_tarifas", "Despesas Bancárias", 500],
["2026-07", "csp_art", "Desp.Cartorarias", 35],
["2026-08", "csp_art", "Desp.Cartorarias", 35],
["2026-09", "csp_art", "Desp.Cartorarias", 35],
["2026-10", "csp_art", "Desp.Cartorarias", 35],
["2026-11", "csp_art", "Desp.Cartorarias", 35],
["2026-12", "csp_art", "Desp.Cartorarias", 35],
["2026-07", "fin_tarifas", "Tarifa Manutenção", 54.9],
["2026-08", "fin_tarifas", "Tarifa Manutenção", 54.9],
["2026-09", "fin_tarifas", "Tarifa Manutenção", 54.9],
["2026-10", "fin_tarifas", "Tarifa Manutenção", 54.9],
["2026-11", "fin_tarifas", "Tarifa Manutenção", 54.9],
["2026-12", "fin_tarifas", "Tarifa Manutenção", 54.9],
["2026-07", "fin_tarifas", "Db Cotas", 200],
["2026-08", "fin_tarifas", "Db Cotas", 200],
["2026-09", "fin_tarifas", "Db Cotas", 200],
["2026-10", "fin_tarifas", "Db Cotas", 200],
["2026-11", "fin_tarifas", "Db Cotas", 200],
["2026-12", "fin_tarifas", "Db Cotas", 200],
["2026-07", "dop_pessoal", "Folha De Pagamento", 20312.96],
["2026-08", "dop_pessoal", "Folha De Pagamento", 20312.96],
["2026-09", "dop_pessoal", "Folha De Pagamento", 19433.89],
["2026-10", "dop_pessoal", "Folha De Pagamento", 19125.29],
["2026-11", "dop_pessoal", "Folha De Pagamento", 18232.77],
["2026-12", "dop_pessoal", "Folha De Pagamento", 18232.77]
];
const PREV_SEED_MONTHS=new Set(PREV_SEED.map(x=>x[0]));

const classifyPlan=SHARED.classifyPlan;

/* A DRE começa em julho/2026; meses anteriores ficam de fora em todas as abas. */
const START_MONTH='2026-07';
let year=new Date().getFullYear();
let recState={loaded:false,loading:null,rows:[],error:''};
const TABS=[['real','Realizado'],['prev','Previsto'],['comp','Previsto × Realizado']];
let tab=(()=>{try{const t=localStorage.getItem('integralDreTab');return TABS.some(x=>x[0]===t)?t:'real'}catch{return 'real'}})();
let compPeriod='acum';

function ensure(){const d=DB();d.dreOverrides=d.dreOverrides||{};d.dreMonthSource=d.dreMonthSource||{};d.dreMonthSourcePrev=d.dreMonthSourcePrev||{};return d}
function cashRows(){try{return window.IntegralFinanceCashflowEditor?.allRows?.()||[]}catch{return []}}
function planRows(){try{return window.integralPlanningRows?.()||[]}catch{return []}}
function sb(){return window.IntegralERP?.sb||null}

async function loadRecebimentos(force){
  if(recState.loading)return recState.loading;
  if(recState.loaded&&!force)return;
  recState.loading=(async()=>{
    const c=sb();if(!c){recState.error='Supabase indisponível.';return}
    const rows=[];let from=0;const size=1000;
    try{
      for(;;){
        const {data,error}=await c.from('fin_receb_parcelas').select('id,vencimento,pago_em,valor_previsto,valor_liquidado,status,ativo').range(from,from+size-1);
        if(error)throw error;rows.push(...(data||[]));if(!data||data.length<size)break;from+=size;
      }
      recState.rows=rows.filter(p=>p.ativo!==false);recState.loaded=true;recState.error='';
    }catch(e){recState.error=String(e?.message||e)}
  })();
  try{await recState.loading}finally{recState.loading=null}
}

/* Fonte de cada mês. Realizado: planilha nos meses fechados (jul–ago/2026).
   Previsto: planilha nesses mesmos meses, para comparar com a mesma base;
   nos demais, Planejamento do sistema (a planilha fica disponível no seletor). */
function seedMonths(kind){return kind==='prev'?PREV_SEED_MONTHS:SEED_MONTHS}
function monthSource(m,kind='real'){
  const d=ensure(),store=kind==='prev'?d.dreMonthSourcePrev:d.dreMonthSource,s=store[m];
  if(s==='planilha'&&seedMonths(kind).has(m))return 'planilha';if(s==='sistema')return 'sistema';
  return SEED_MONTHS.has(m)&&seedMonths(kind).has(m)?'planilha':'sistema';
}

function pusher(items){const d=ensure();return it=>{if(it.month<START_MONTH)return;const ov=d.dreOverrides[it.key];const line=ov&&LINE[ov]?ov:it.auto;items.push({...it,line,reclassified:!!(ov&&ov!==it.auto)})}}

/* Realizado: {key, month, line, label, value, origin, auto}. */
function collectReal(){
  const d=ensure(),items=[],yearPrefix=String(year),push=pusher(items);
  SEED.forEach(([m,line,label,value],i)=>{if(!m.startsWith(yearPrefix)||monthSource(m)!=='planilha')return;push({key:`seed:${m}:${i}`,month:m,auto:line,label,value:+value||0,origin:SEED_SOURCE})});
  const boletosFromCash=new Set();
  cashRows().forEach(r=>{
    const m=String(r.date||'').slice(0,7);if(!m.startsWith(yearPrefix)||monthSource(m)!=='sistema')return;
    if(!['Entrada','Saída'].includes(r.direction))return;const v=Math.abs(+r.value||0);if(!v)return;
    /* Há ids repetidos em importações antigas; data+valor desambiguam a chave. */
    const auto=classify(r);const key=`${r._sourceKey||`cash:${r.id}`}|${r.date}|${v}`;
    push({key,month:m,auto,label:r.description||'(sem descrição)',value:v,origin:`Fluxo de Caixa · ${r.source||'Manual'}`,date:r.date,kind:r.kind});
    if((d.dreOverrides[key]||auto)==='rec_boletos')boletosFromCash.add(m);
  });
  /* Recebimentos entra como receita de boletos apenas quando o Fluxo do mês
     ainda não tem a cobrança bancária lançada — evita contar duas vezes. */
  const recPaid=new Map();
  recState.rows.forEach(p=>{if(p.status!=='Pago')return;const m=String(p.pago_em||p.vencimento||'').slice(0,7);if(!m.startsWith(yearPrefix))return;recPaid.set(m,(recPaid.get(m)||0)+Number(p.valor_liquidado||p.valor_previsto||0))});
  recPaid.forEach((v,m)=>{if(monthSource(m)!=='sistema'||boletosFromCash.has(m)||!v)return;push({key:`receb:${m}`,month:m,auto:'rec_boletos',label:'Boletos liquidados (Recebimentos)',value:v,origin:'Recebimentos'})});
  return items;
}

/* Previsto: planilha (Entradas - Previsão / Saídas - Previsto Geral) ou Planejamento. */
function collectPrev(){
  const items=[],yearPrefix=String(year),push=pusher(items);
  PREV_SEED.forEach(([m,line,label,value],i)=>{if(!m.startsWith(yearPrefix)||monthSource(m,'prev')!=='planilha')return;push({key:`pseed:${m}:${i}`,month:m,auto:line,label,value:+value||0,origin:PREV_SEED_SOURCE})});
  planRows().forEach(r=>{
    const m=String(r.month||r.date||'').slice(0,7);if(!m.startsWith(yearPrefix)||monthSource(m,'prev')!=='sistema')return;
    if(!['Entrada','Saída'].includes(r.direction))return;const v=Math.abs(+r.value||0);if(!v)return;
    const auto=classifyPlan(r);
    push({key:`plan:${r.source}|${r.origin}|${r.date}|${Math.round(v*100)/100}`,month:m,auto,label:r.origin||'(sem descrição)',value:v,origin:`Planejamento · ${r.source||''}`,date:r.date,kind:r.category||''});
  });
  return items;
}
const collect=kind=>kind==='prev'?collectPrev():collectReal();

function compute(items){
  const months=MONTHS.map((_,i)=>monthKey(year,i));
  const byLine={},has=new Set(items.map(x=>x.month));
  LINES.forEach(l=>{byLine[l.id]=Object.fromEntries(months.map(m=>[m,0]))});
  items.forEach(it=>{if(byLine[it.line]&&it.month in byLine[it.line])byLine[it.line][it.month]+=it.value*LINE[it.line].sign});
  const groupSum=(g,m)=>LINES.filter(l=>l.group===g).reduce((s,l)=>s+byLine[l.id][m],0);
  const sumOver=(fn,ms)=>ms.reduce((s,m)=>s+fn(m),0);
  return {months,byLine,groupSum,has,sumOver};
}

function recIndicators(){
  const months=MONTHS.map((_,i)=>monthKey(year,i)),out={};
  months.forEach(m=>out[m]={expected:0,received:0,n:0,paid:0});
  const inRange=m=>out[m]&&m>=START_MONTH;
  recState.rows.forEach(p=>{
    if(p.status==='Cancelado')return;
    const due=String(p.vencimento||'').slice(0,7);
    if(inRange(due)){out[due].expected+=Number(p.valor_previsto||0);out[due].n++;if(p.status==='Pago')out[due].paid++}
    if(p.status==='Pago'){const pm=String(p.pago_em||p.vencimento||'').slice(0,7);if(inRange(pm))out[pm].received+=Number(p.valor_liquidado||p.valor_previsto||0)}
  });
  return out;
}

function ensureStyle(){
  if(q('#dreStyle'))return;const s=document.createElement('style');s.id='dreStyle';s.textContent=`
.dre-wrap{overflow:auto;background:var(--ds-surface,#fff);border:1px solid var(--ds-border,#d9e6e4);border-radius:var(--ds-r-card,12px);box-shadow:var(--ds-shadow-card,none);max-width:100%}
.dre-table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px;min-width:1100px;color:var(--ds-text,#183552)}
.dre-table.compact{min-width:760px}
.dre-table th,.dre-table td{padding:8px 10px;border-bottom:1px solid var(--ds-border,#e8efed);white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}
.dre-table th:first-child,.dre-table td:first-child{text-align:left;position:sticky;left:0;background:var(--ds-surface,#fff);z-index:1;min-width:290px;max-width:340px;white-space:normal}
.dre-table thead th{background:var(--ds-surface-2,#f6faf9);color:var(--ds-muted,#5b6b7b);font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;position:sticky;top:0;z-index:2;vertical-align:bottom}
.dre-table thead th:first-child{z-index:3;background:var(--ds-surface-2,#f6faf9)}
.dre-table .dre-src{display:block;margin-top:4px;font-size:11px;text-transform:none;letter-spacing:0;font-weight:600;color:var(--ds-muted,#5b6b7b)}
.dre-table .dre-src select{width:auto;padding:2px 6px;font-size:11px;border-radius:var(--ds-r-field,8px)}
.dre-table tr.dre-group td{font-weight:700;color:var(--ds-primary,#115e59);background:var(--ds-surface-2,#fbfdfd)}
.dre-table tr.dre-group td:first-child{background:var(--ds-surface-2,#fbfdfd)}
.dre-table tr.dre-line td:first-child{padding-left:24px;color:var(--ds-text,#183552)}
.dre-table tr.dre-line:hover td{background:var(--ds-row-hover,#f7f9f8)}
.dre-table tr.dre-total td{font-weight:700;background:var(--ds-primary-soft,#e3eeec);border-top:1px solid var(--ds-primary-soft-2,#d6e6e3)}
.dre-table tr.dre-total td:first-child{background:var(--ds-primary-soft,#e3eeec)}
.dre-table tr.dre-total.strong td{background:var(--ds-primary-fill,#115e59);color:var(--ds-on-primary,#fff)}
.dre-table tr.dre-total.strong td:first-child{background:var(--ds-primary-fill,#115e59)}
.dre-table tr.dre-margin td{font-size:12px;color:var(--ds-muted,#5b6b7b);padding-top:2px;padding-bottom:6px}
.dre-table td.dre-cell{cursor:pointer}.dre-table td.dre-cell:hover{background:var(--ds-primary-soft,#e3eeec)!important}
.dre-table td.neg{color:var(--ds-danger,#b42318)}.dre-table tr.dre-total.strong td.neg,.dre-table tr.dre-total.strong td.pos{color:var(--ds-on-primary,#fff)}
.dre-table td.pos{color:var(--ds-success,#1e7b45)}
.dre-table td.empty{color:var(--ds-disabled,#a7b1b0)}.dre-table .col-total{border-left:2px solid var(--ds-border-strong,#b9ccc8)}
.dre-table td.dre-status{text-align:left}
.dre-table tr.dre-furo td,.dre-table tr.dre-furo td:first-child{background:var(--ds-danger-bg,#fbe7e6)}
.dre-kpis .metric b{font-size:22px}
.dre-kpis .metric .dre-vs{display:block;margin-top:6px;font-size:12px;color:var(--ds-muted,#5b6b7b)}
.dre-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ds-muted,#5b6b7b);margin:10px 0 0}
.dre-items td select{padding:4px 6px;font-size:12px}
.dre-items .table{min-width:680px;font-size:13px}
.dre-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:var(--ds-r-card,12px);background:var(--ds-surface-2,#e8f2f1);border:1px solid var(--ds-border,#d6e2df);margin-bottom:16px;flex-wrap:wrap}
.dre-tabs button{border:0;background:transparent;color:var(--ds-muted,#5b6b7b);font-weight:600;font-size:14px;padding:8px 14px;border-radius:var(--ds-r-field,8px);cursor:pointer}
.dre-tabs button:hover{color:var(--ds-text,#183552)}
.dre-tabs button[aria-selected="true"]{background:var(--ds-primary-soft,#e3eeec);color:var(--ds-primary,#115e59);font-weight:700}
.dre-tabs button:focus-visible{outline:none;box-shadow:var(--ds-focus,0 0 0 3px rgba(17,94,89,.18))}
.dre-furos{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:4px}
.dre-furo-card{border:1px solid var(--ds-danger-border,#f0c3bf);background:var(--ds-surface,#fff);border-radius:var(--ds-r-card,12px);box-shadow:var(--ds-shadow-card,none);padding:12px 16px;cursor:pointer;text-align:left;font:inherit;color:var(--ds-text,#183552)}
.dre-furo-card:hover{background:var(--ds-danger-bg,#fbe7e6)}
.dre-furo-card b{display:block;margin:2px 0 4px}.dre-furo-card .v{color:var(--ds-danger,#b42318);font-weight:700}
.dre-furo-card small{color:var(--ds-muted,#5b6b7b);display:block}
@media(max-width:740px){.dre-table th:first-child,.dre-table td:first-child{min-width:190px}}
`;document.head.appendChild(s)}

function fmtSigned(v){return v<0?`(${N(-v)})`:N(v)}
function pct(v,base){return base?`${(v/base*100).toFixed(1).replace('.',',')}%`:'—'}
function monthName(m){return `${MONTHS[+m.slice(5)-1]}/${m.slice(0,4)}`}
function cellHtml(v,line,m,has,kind){
  const attrs=line?`data-dre-line="${line}" data-dre-month="${m}" data-dre-kind="${kind}"`:'';
  if(!has)return `<td class="empty${line?' dre-cell':''}" ${attrs}>—</td>`;
  return `<td class="${v<0?'neg':''}${line?' dre-cell':''}" ${attrs}>${fmtSigned(v)}</td>`;
}

async function render(){
  if(!isAdmin())return typeof documents==='function'?documents():null;
  try{title('DRE')}catch{const t=q('#title');if(t)t.textContent='DRE'}
  const c=q('#content');if(!c)return;ensureStyle();
  if(!recState.loaded&&!recState.loading){c.innerHTML='<div class="notice">Carregando DRE…</div>';await loadRecebimentos()}
  draw();
}

function toolbar(extra=''){
  const years=[...new Set([year-1,year,year+1,new Date().getFullYear()])].sort();
  return `<div class="dre-tabs" role="tablist">${TABS.map(([id,l])=>`<button type="button" role="tab" data-dre-tab="${id}" aria-selected="${tab===id}">${l}</button>`).join('')}</div>
  <div class="toolbar"><div class="left"><label class="muted" for="dreYear">Exercício</label><select id="dreYear" style="width:auto">${years.map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select>${extra}</div><div class="right"><button class="btn secondary" id="dreReload">Atualizar Recebimentos</button><button class="btn" id="dreExport">Exportar Excel</button></div></div>`;
}
function bindCommon(){
  qa('[data-dre-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.dreTab;try{localStorage.setItem('integralDreTab',tab)}catch{}draw()});
  q('#dreYear').onchange=e=>{year=+e.target.value;compPeriod='acum';draw()};
  q('#dreReload').onclick=async e=>{e.target.disabled=true;e.target.textContent='Atualizando…';await loadRecebimentos(true);draw()};
  q('#dreExport').onclick=exportXlsx;
  qa('[data-dre-src]').forEach(s=>{s.onclick=e=>e.stopPropagation();s.onchange=()=>{const d=ensure(),store=s.dataset.dreSrcKind==='prev'?d.dreMonthSourcePrev:d.dreMonthSource;store[s.dataset.dreSrc]=s.value;persist();draw()}});
  qa('[data-dre-line]').forEach(td=>td.onclick=()=>details(td.dataset.dreLine,td.dataset.dreMonth,td.dataset.dreKind));
}

function draw(){
  const c=q('#content');if(!c)return;
  if(tab==='comp')drawComparison(c);else drawStatement(c,tab);
  bindCommon();
}

function drawStatement(c,kind){
  const items=collect(kind),{months,byLine,groupSum,has}=compute(items),rec=recIndicators();
  const totalOf=(line)=>months.reduce((s,m)=>s+byLine[line][m],0);
  const groupTotal=g=>months.reduce((s,m)=>s+groupSum(g,m),0);
  const sumGroups=(gs,m)=>gs.reduce((s,g)=>s+(m?groupSum(g,m):groupTotal(g)),0);
  const rb=groupTotal('rb'),av=v=>pct(v,rb);
  const ro=sumGroups(['rb','ded','csp','dop']),rl=sumGroups(['rb','ded','csp','dop','fin']),caixa=sumGroups(['rb','ded','csp','dop','fin','inv','soc']);
  const monthsWithData=months.filter(m=>has.has(m)).length;
  /* Oculta os meses iniciais sem movimentação; os totais continuam sobre o ano todo. */
  const first=months.findIndex(m=>has.has(m)||rec[m].expected),vis=first>0?months.slice(first):months;
  const seeds=seedMonths(kind);
  const header=`<tr><th>${kind==='prev'?'Previsto':'Realizado'} ${year}</th>${vis.map(m=>{const i=+m.slice(5)-1,src=monthSource(m,kind);return `<th>${MONTHS[i]}${seeds.has(m)?`<span class="dre-src"><select data-dre-src="${m}" data-dre-src-kind="${kind}" title="Fonte do mês"><option value="planilha" ${src==='planilha'?'selected':''}>Planilha</option><option value="sistema" ${src==='sistema'?'selected':''}>Sistema</option></select></span>`:has.has(m)?`<span class="dre-src">${kind==='prev'?'Planejamento':'Sistema'}</span>`:''}</th>`}).join('')}<th class="col-total">Total</th><th>AV %</th></tr>`;
  let body='';
  LAYOUT.forEach(row=>{
    if(row.group){
      const g=row.group;
      body+=`<tr class="dre-group"><td>${GROUPS[g]}</td>${vis.map(m=>cellHtml(groupSum(g,m),null,m,has.has(m),kind)).join('')}<td class="col-total ${groupTotal(g)<0?'neg':''}">${fmtSigned(groupTotal(g))}</td><td>${av(groupTotal(g))}</td></tr>`;
      LINES.filter(l=>l.group===g).forEach(l=>{const t=totalOf(l.id);body+=`<tr class="dre-line"><td>${E(l.label)}</td>${vis.map(m=>cellHtml(byLine[l.id][m],l.id,m,has.has(m),kind)).join('')}<td class="col-total dre-cell ${t<0?'neg':''}" data-dre-line="${l.id}" data-dre-month="all" data-dre-kind="${kind}">${fmtSigned(t)}</td><td>${av(t)}</td></tr>`});
    }else{
      const t=sumGroups(row.groups);
      body+=`<tr class="dre-total ${row.strong?'strong':''}"><td>${row.label}</td>${vis.map(m=>cellHtml(sumGroups(row.groups,m),null,m,has.has(m),kind)).join('')}<td class="col-total ${t<0?'neg':''}">${fmtSigned(t)}</td><td>${av(t)}</td></tr>`;
      if(row.margin)body+=`<tr class="dre-margin"><td>Margem sobre a receita bruta</td>${vis.map(m=>{const r=groupSum('rb',m);return `<td>${has.has(m)&&r?pct(sumGroups(row.groups,m),r):''}</td>`}).join('')}<td class="col-total">${av(t)}</td><td></td></tr>`;
    }
  });
  const recRows=`<tr class="dre-group"><td>RECEBIMENTOS (boletos)</td>${vis.map(()=>'<td></td>').join('')}<td class="col-total"></td><td></td></tr>
  <tr class="dre-line"><td>Previsto pelo vencimento</td>${vis.map(m=>`<td>${rec[m].expected?N(rec[m].expected):'<span class="muted">—</span>'}</td>`).join('')}<td class="col-total">${N(months.reduce((s,m)=>s+rec[m].expected,0))}</td><td></td></tr>
  <tr class="dre-line"><td>Liquidado (baixado em Recebimentos)</td>${vis.map(m=>`<td>${rec[m].received?N(rec[m].received):'<span class="muted">—</span>'}</td>`).join('')}<td class="col-total">${N(months.reduce((s,m)=>s+rec[m].received,0))}</td><td></td></tr>
  <tr class="dre-margin"><td>Adimplência (parcelas pagas / vencendo no mês)</td>${vis.map(m=>`<td>${rec[m].n?Math.round(rec[m].paid/rec[m].n*100)+'%':''}</td>`).join('')}<td class="col-total"></td><td></td></tr>`;
  const prevWord=kind==='prev';
  const legend=prevWord
    ?`<span>Previsto de jul–ago/2026 vem da planilha (Entradas - Previsão e Saídas - Previsto Geral); a partir de set/2026, do Planejamento do sistema (receitas planejadas, contratos do ERP, despesas planejadas, contas cadastradas e folha do RH).</span><span>Set–dez/2026 também podem usar a planilha pelo seletor do mês.</span>`
    :`<span>Meses jul–ago/2026 podem usar a planilha anual ou os lançamentos do sistema.</span><span>Boletos: usa a cobrança lançada no Fluxo de Caixa; se o mês ainda não tiver, usa o que foi baixado em Recebimentos.</span>`;
  c.innerHTML=`${toolbar(`<span class="muted">${monthsWithData} ${monthsWithData===1?'mês':'meses'} com ${prevWord?'previsão':'movimentação'}</span>`)}
  <div class="grid cols-4 dre-kpis"><div class="card metric"><h3>Receita bruta ${prevWord?'prevista':''}</h3><b>${M(rb)}</b><small>Acumulado ${String(year)===START_MONTH.slice(0,4)?`desde ${monthName(START_MONTH).toLowerCase()}`:year}</small></div><div class="card metric"><h3>Resultado operacional (EBITDA)</h3><b class="${ro<0?'kpi-negative':''}">${M(ro)}</b><small>Margem ${av(ro)}</small></div><div class="card metric"><h3>Resultado líquido</h3><b class="${rl<0?'kpi-negative':''}">${M(rl)}</b><small>Margem ${av(rl)}</small></div><div class="card metric"><h3>Geração de caixa</h3><b class="${caixa<0?'kpi-negative':''}">${M(caixa)}</b><small>Após investimentos e sócios</small></div></div>
  ${recState.error?`<div class="notice warn" style="margin-top:14px">Recebimentos não carregado: ${E(recState.error)}</div>`:''}
  <h3 class="section-title">${prevWord?'DRE prevista':'Demonstração do Resultado do Exercício'} — gerencial, regime de caixa</h3>
  <div class="dre-wrap"><table class="dre-table"><thead>${header}</thead><tbody>${body}${recRows}</tbody></table></div>
  <div class="dre-legend"><span>Valores em R$. Negativos entre parênteses.</span><span>Clique em um valor para ver os lançamentos e reclassificar.</span>${legend}</div>`;
}

/* Desvio sempre em "quanto melhor/pior para o caixa": realizado − previsto sobre
   valores com sinal. Negativo = receita abaixo ou despesa acima do previsto. */
function varianceStatus(prev,real){
  const dv=real-prev,base=Math.abs(prev);
  if(Math.abs(dv)<0.005)return {cls:'',label:'<span class="badge">No previsto</span>',furo:false};
  if(dv>0)return {cls:'pos',label:'<span class="badge ok">Melhor que o previsto</span>',furo:false};
  const significant=Math.abs(dv)>=Math.max(500,base*0.05);
  if(!significant)return {cls:'neg',label:'<span class="badge">Dentro da margem</span>',furo:false};
  return {cls:'neg',label:`<span class="badge danger">${prev===0?'Furo · não previsto':'Furo'}</span>`,furo:true};
}

function varPct(dv,p){if(!p)return '—';const v=dv/Math.abs(p)*100;return Math.abs(v)>999?`${v>0?'>+':'<−'}999%`:`${v>0?'+':''}${v.toFixed(1).replace('.',',')}%`}

function comparisonData(){
  const pi=collectPrev(),ri=collectReal(),P=compute(pi),R=compute(ri);
  /* Só compara meses que têm previsão e realizado. */
  const both=P.months.filter(m=>P.has.has(m)&&R.has.has(m));
  const period=compPeriod!=='acum'&&both.includes(compPeriod)?[compPeriod]:both;
  return {pi,ri,P,R,both,period};
}

function drawComparison(c){
  const {P,R,both,period}=comparisonData();
  const lineVal=(X,l)=>period.reduce((s,m)=>s+X.byLine[l][m],0);
  const groupVal=(X,g)=>period.reduce((s,m)=>s+X.groupSum(g,m),0);
  const groupsVal=(X,gs)=>gs.reduce((s,g)=>s+groupVal(X,g),0);
  const row=(cls,label,p,r,attrs='')=>{const st=varianceStatus(p,r),dv=r-p;return `<tr class="${cls}${st.furo&&cls==='dre-line'?' dre-furo':''}"><td>${label}</td><td class="${p<0?'neg':''}">${fmtSigned(p)}</td><td class="${r<0?'neg':''} ${attrs?'dre-cell':''}" ${attrs}>${fmtSigned(r)}</td><td class="${st.cls}">${dv>0?'+':''}${fmtSigned(dv)}</td><td class="${st.cls}">${varPct(dv,p)}</td><td class="dre-status">${cls==='dre-margin'?'':st.label}</td></tr>`};
  const monthArg=period.length===1?period[0]:'period';
  let body='';
  LAYOUT.forEach(r=>{
    if(r.group){
      body+=row('dre-group',GROUPS[r.group],groupVal(P,r.group),groupVal(R,r.group));
      LINES.filter(l=>l.group===r.group).forEach(l=>{const p=lineVal(P,l.id),x=lineVal(R,l.id);if(!p&&!x)return;body+=row('dre-line',E(l.label),p,x,`data-dre-line="${l.id}" data-dre-month="${monthArg}" data-dre-kind="comp"`)});
    }else body+=row(`dre-total ${r.strong?'strong':''}`,r.label,groupsVal(P,r.groups),groupsVal(R,r.groups));
  });
  /* Maiores furos por linha e mês dentro do período. */
  const furos=[];
  period.forEach(m=>LINES.forEach(l=>{const p=P.byLine[l.id][m],x=R.byLine[l.id][m],st=varianceStatus(p,x);if(st.furo)furos.push({m,l,p,x,dv:x-p})}));
  furos.sort((a,b)=>a.dv-b.dv);
  const kp=(label,p,r,abs)=>{const dv=r-p,st=varianceStatus(p,r),show=v=>M(abs?Math.abs(v):v);return `<div class="card metric"><h3>${label}</h3><b class="${!abs&&r<0?'kpi-negative':''}">${show(r)}</b><span class="dre-vs">Previsto ${show(p)}</span><small class="${st.cls==='neg'?'kpi-negative':st.cls==='pos'?'kpi-positive':''}">${dv>0?'+':''}${M(dv)} ${p?`(${varPct(dv,p)})`:''}</small></div>`};
  const despGroups=['ded','csp','dop','fin'];
  const periodSel=`<label class="muted" for="drePeriod">Período</label><select id="drePeriod" style="width:auto"><option value="acum" ${compPeriod==='acum'||!both.includes(compPeriod)?'selected':''}>Acumulado (${both.length} ${both.length===1?'mês':'meses'})</option>${both.map(m=>`<option value="${m}" ${compPeriod===m?'selected':''}>${monthName(m)}</option>`).join('')}</select>`;
  const pl=period.length?`${monthName(period[0])}${period.length>1?` a ${monthName(period.at(-1))}`:''}`:'';
  c.innerHTML=`${toolbar(periodSel)}
  ${both.length?`<div class="grid cols-4 dre-kpis">${kp('Receita bruta',groupVal(P,'rb'),groupVal(R,'rb'))}${kp('Custos e despesas operacionais',groupsVal(P,despGroups),groupsVal(R,despGroups),true)}${kp('Resultado líquido',groupsVal(P,['rb',...despGroups]),groupsVal(R,['rb',...despGroups]))}${kp('Geração de caixa',groupsVal(P,['rb',...despGroups,'inv','soc']),groupsVal(R,['rb',...despGroups,'inv','soc']))}</div>
  <h3 class="section-title">Onde tivemos furos — ${pl}</h3>
  ${furos.length?`<div class="dre-furos">${furos.slice(0,9).map(f=>`<button type="button" class="dre-furo-card" data-dre-line="${f.l.id}" data-dre-month="${f.m}" data-dre-kind="comp"><small>${monthName(f.m)} · ${f.l.sign>0?'receita abaixo do previsto':'gasto acima do previsto'}</small><b>${E(f.l.label)}</b><span class="v">${M(f.dv)}</span><small>Previsto ${M(Math.abs(f.p))} · realizado ${M(Math.abs(f.x))}</small></button>`).join('')}</div>${furos.length>9?`<p class="muted">+ ${furos.length-9} furo(s) menores na tabela abaixo.</p>`:''}`:'<div class="notice">Nenhum furo relevante no período: receitas e despesas ficaram dentro da margem (5% ou R$ 500).</div>'}
  <h3 class="section-title">Previsto × Realizado por linha da DRE</h3>
  <div class="dre-wrap"><table class="dre-table compact"><thead><tr><th>Linha</th><th>Previsto</th><th>Realizado</th><th>Desvio (R$)</th><th>Desvio (%)</th><th style="text-align:left">Situação</th></tr></thead><tbody>${body}</tbody></table></div>
  <div class="dre-legend"><span>Desvio = realizado − previsto. Negativo significa receita abaixo ou despesa acima do previsto.</span><span>Furo: desvio desfavorável de pelo menos 5% da linha e R$ 500.</span><span>Clique em uma linha para ver os lançamentos previstos e realizados lado a lado.</span><span>A fonte de cada mês segue o que está escolhido nas abas Realizado e Previsto.</span></div>`
  :`<div class="notice">Ainda não há meses de ${year} com previsão e realizado ao mesmo tempo.</div>`}`;
  const sel=q('#drePeriod');if(sel)sel.onchange=e=>{compPeriod=e.target.value;draw()};
}

function itemsTable(items){
  const opts=sel=>LINES.map(o=>`<option value="${o.id}" ${o.id===sel?'selected':''}>${E(o.label)}</option>`).join('');
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Mês</th><th>Descrição</th><th>Origem</th><th style="text-align:right">Valor</th><th>Linha da DRE</th></tr></thead><tbody>${items.map(x=>`<tr><td>${x.month.split('-').reverse().join('/')}</td><td><b>${E(x.label)}</b>${x.kind?`<small class="muted" style="display:block">${E(x.kind)}</small>`:''}${x.reclassified?'<small class="muted" style="display:block">Reclassificado manualmente</small>':''}</td><td><small>${E(x.origin)}</small></td><td style="text-align:right;white-space:nowrap">${M(x.value)}</td><td><select data-dre-reclass="${E(x.key)}" data-dre-auto="${x.auto}">${opts(x.line)}</select></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Sem lançamentos.</div></td></tr>'}</tbody></table></div>`;
}

function details(lineId,month,kind){
  const l=LINE[lineId];
  const sortIt=a=>a.sort((x,y)=>x.month.localeCompare(y.month)||y.value-x.value);
  let months=null,when;
  if(month==='all')when=`${year}`;
  else if(month==='period'){months=comparisonData().period;when=months.length?`${monthName(months[0])} a ${monthName(months.at(-1))}`:`${year}`}
  else{months=[month];when=monthName(month)}
  const pick=list=>sortIt(list.filter(x=>x.line===lineId&&(!months||months.includes(x.month))));
  const sum=a=>a.reduce((s,x)=>s+x.value,0);
  const note='Mudar a linha reclassifica somente na DRE — o lançamento original não é alterado.';
  let html;
  if(kind==='comp'){
    const p=pick(collectPrev()),r=pick(collectReal()),dv=(sum(r)-sum(p))*l.sign;
    html=`<div class="modal-body dre-items"><p class="muted" style="margin-top:0">Previsto ${M(sum(p))} · realizado ${M(sum(r))} · desvio <b class="${dv<0?'kpi-negative':'kpi-positive'}">${dv>0?'+':''}${M(dv)}</b>. ${note}</p><h4 style="margin:14px 0 8px">Realizado (${r.length})</h4>${itemsTable(r)}<h4 style="margin:18px 0 8px">Previsto (${p.length})</h4>${itemsTable(p)}</div>`;
  }else{
    const items=pick(collect(kind));
    html=`<div class="modal-body dre-items"><p class="muted" style="margin-top:0">${items.length} lançamento(s) ${kind==='prev'?'previstos':''} · total ${M(sum(items))}. ${note}</p>${itemsTable(items)}</div>`;
  }
  const head=`${E(l.label)} — ${when}${kind==='prev'?' (previsto)':kind==='comp'?' (previsto × realizado)':''}`;
  let x;
  if(typeof v2modal==='function'){x=v2modal(head,html)}
  else{x=document.createElement('div');x.className='modal-backdrop';x.innerHTML=`<div class="modal"><div class="modal-head"><h3>${head}</h3><button class="btn ghost small" data-dre-close>Fechar</button></div>${html}</div>`;document.body.appendChild(x);x.querySelector('[data-dre-close]').onclick=()=>x.remove()}
  const m=x.querySelector('.modal');if(m)m.style.width='min(980px,96vw)';
  qa('[data-dre-reclass]',x).forEach(s=>s.onchange=()=>{const d=ensure();if(s.value===s.dataset.dreAuto)delete d.dreOverrides[s.dataset.dreReclass];else d.dreOverrides[s.dataset.dreReclass]=s.value;persist();draw()});
}

function exportXlsx(){
  if(!window.XLSX)return alert('Biblioteca de planilhas não carregada.');
  const r2=v=>Math.round(v*100)/100;
  const statement=(X,titleText)=>{
    const aoa=[[titleText,...MONTHS,'Total']];
    const rowOf=(label,fn)=>{const vals=X.months.map(fn);aoa.push([label,...vals.map(r2),r2(vals.reduce((s,v)=>s+v,0))])};
    LAYOUT.forEach(row=>{
      if(row.group){rowOf(GROUPS[row.group],m=>X.groupSum(row.group,m));LINES.filter(l=>l.group===row.group).forEach(l=>rowOf('   '+l.label,m=>X.byLine[l.id][m]))}
      else rowOf(row.label,m=>row.groups.reduce((s,g)=>s+X.groupSum(g,m),0));
    });
    const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:52},...X.months.map(()=>({wch:13})),{wch:14}];return ws;
  };
  const {pi,ri,P,R,both}=comparisonData();
  const comp=[[`Previsto × Realizado ${year}`,...both.flatMap(m=>[`${monthName(m)} previsto`,`${monthName(m)} realizado`,`${monthName(m)} desvio`]),'Acum. previsto','Acum. realizado','Acum. desvio']];
  const compRow=(label,fn)=>{const cells=both.flatMap(m=>{const p=fn(P,m),x=fn(R,m);return [r2(p),r2(x),r2(x-p)]});const p=both.reduce((s,m)=>s+fn(P,m),0),x=both.reduce((s,m)=>s+fn(R,m),0);comp.push([label,...cells,r2(p),r2(x),r2(x-p)])};
  LAYOUT.forEach(row=>{
    if(row.group){compRow(GROUPS[row.group],(X,m)=>X.groupSum(row.group,m));LINES.filter(l=>l.group===row.group).forEach(l=>compRow('   '+l.label,(X,m)=>X.byLine[l.id][m]))}
    else compRow(row.label,(X,m)=>row.groups.reduce((s,g)=>s+X.groupSum(g,m),0));
  });
  const det=[['Tipo','Mês','Linha da DRE','Descrição','Origem','Valor']];
  [['Realizado',ri],['Previsto',pi]].forEach(([t,list])=>list.slice().sort((a,b)=>a.month.localeCompare(b.month)).forEach(x=>det.push([t,x.month,LINE[x.line].label,x.label,x.origin,x.value*LINE[x.line].sign])));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,statement(R,`DRE realizada ${year} — Integral`),'Realizado');
  XLSX.utils.book_append_sheet(wb,statement(P,`DRE prevista ${year} — Integral`),'Previsto');
  const wc=XLSX.utils.aoa_to_sheet(comp);wc['!cols']=[{wch:52},...comp[0].slice(1).map(()=>({wch:15}))];
  XLSX.utils.book_append_sheet(wb,wc,'Previsto x Realizado');
  const wd=XLSX.utils.aoa_to_sheet(det);wd['!cols']=[{wch:10},{wch:9},{wch:44},{wch:44},{wch:34},{wch:14}];
  XLSX.utils.book_append_sheet(wb,wd,'Lançamentos');
  XLSX.writeFile(wb,`DRE_Integral_${year}.xlsx`);
}

window.IntegralDRE={render,classify,classifyPlan,collect,reload:()=>loadRecebimentos(true).then(draw),lines:LINES};
})();
