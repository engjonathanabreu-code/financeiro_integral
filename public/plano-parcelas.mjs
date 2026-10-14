export const parcelaProtegida = p => !!(p.protegida || p.tipo === 'Entrada' || ['Pago','Parcial','Cancelado'].includes(p.status) || Number(p.valor_liquidado || 0) > 0 || p.pago_em || p.linha_digitavel || p.nosso_numero || p.documento);
export const parcelasEditaveis = parcelas => parcelas.filter(p => p.ativo !== false && !parcelaProtegida(p));
export function linhasDoPlano(parcelas, quantidade, rascunho = []) {
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 360) throw new Error('Informe de 0 a 360 parcelas editáveis.');
  const originais = parcelasEditaveis(parcelas);
  return Array.from({length:quantidade},(_,i) => ({...(rascunho[i] || originais[i] || {vencimento:'',valor_previsto:''})}));
}
export function prepararPlano(parcelas, linhas, motivo) {
  if (String(motivo || '').trim().length < 5) throw new Error('Informe o motivo da revisão.');
  const editaveis = parcelasEditaveis(parcelas), ids = new Set();
  if (!Array.isArray(linhas) || linhas.length > 360) throw new Error('Quantidade inválida.');
  const itens = linhas.map(linha => {
    const id = linha.id || null;
    if (id && (!editaveis.some(p => p.id === id) || ids.has(id))) throw new Error('Parcela protegida, desconhecida ou repetida.');
    if (id) ids.add(id);
    const vencimento = String(linha.vencimento || ''), valor = Number(linha.valor_previsto);
    const data = new Date(`${vencimento}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento) || !Number.isFinite(data.getTime()) || data.toISOString().slice(0,10) !== vencimento || linha.valor_previsto === '' || !Number.isFinite(valor) || valor < 0 || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.00001) throw new Error('Confira o vencimento e o valor em centavos de cada parcela.');
    return {id, vencimento, valor_previsto:valor};
  });
  return {anteriores:parcelas.filter(p => p.ativo !== false).map(p => ({id:p.id,versao:p.versao})).sort((a,b)=>a.id.localeCompare(b.id)),itens,motivo:String(motivo).trim(),canceladas:editaveis.filter(p => !ids.has(p.id)),protegidas:parcelas.filter(parcelaProtegida),totalNovoCentavos:itens.reduce((s,p)=>s+Math.round(p.valor_previsto*100),0)};
}
