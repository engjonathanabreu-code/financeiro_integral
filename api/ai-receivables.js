module.exports=async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!process.env.OPENAI_API_KEY)return res.status(500).json({ok:false,error:'OPENAI_API_KEY_NOT_CONFIGURED'});
 try{
  const {file,fileName='relatorio.pdf'}=req.body||{};
  if(!file||!String(file).startsWith('data:application/pdf'))return res.status(400).json({ok:false,error:'PDF_REQUIRED'});
  if(file.length>12000000)return res.status(413).json({ok:false,error:'FILE_TOO_LARGE'});
  const entry={type:'object',additionalProperties:false,properties:{pagador:{type:'string'},cpf_cnpj:{type:'string'},nosso_numero:{type:'string'},documento:{type:'string'},vencimento:{type:'string'},pagamento:{type:'string'},valor_nominal:{type:'number'},valor_liquidado:{type:'number'}},required:['pagador','cpf_cnpj','nosso_numero','documento','vencimento','pagamento','valor_nominal','valor_liquidado']};
  const schema={type:'object',additionalProperties:false,properties:{periodo_inicio:{type:'string'},periodo_fim:{type:'string'},entries:{type:'array',items:entry}},required:['periodo_inicio','periodo_fim','entries']};
  const prompt='Leia integralmente este relatório bancário de carteira de cobrança da Integral. Extraia SOMENTE os títulos/boletos liquidados/pagos, uma linha por boleto. Preserve Pagador, CPF/CNPJ, Nosso Número e Documento exatamente como aparecem. Datas devem ser YYYY-MM-DD. Valor nominal e liquidado devem ser números. Ignore linhas TOTAL/DIFERENÇA/QUANTIDADE. Não deduza nem invente dados.';
  const configured=String(process.env.OPENAI_FINANCE_MODEL||'').trim();
  const model=!configured||configured==='gpt-5.6-luna'?'gpt-5-mini':configured;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_file',file_data:file,filename:fileName}]}],text:{format:{type:'json_schema',name:'integral_receivables_report',strict:true,schema}}})});
  const raw=await response.text();
  let data={};try{data=raw?JSON.parse(raw):{}}catch{return res.status(502).json({ok:false,error:'OPENAI_INVALID_RESPONSE',details:'A OpenAI retornou uma resposta inválida.'})}
  if(!response.ok)return res.status(response.status).json({ok:false,error:'OPENAI_ERROR',details:data?.error?.message||'Falha na OpenAI',model});
  const text=data.output_text||(data.output||[]).flatMap(i=>i.content||[]).filter(i=>i.type==='output_text').map(i=>i.text).join('');
  let parsed={};try{parsed=JSON.parse(text||'{}')}catch{return res.status(502).json({ok:false,error:'OPENAI_OUTPUT_INVALID',details:'Não foi possível interpretar o relatório retornado pela IA.'})}
  return res.status(200).json({ok:true,model:data.model||model,...parsed});
 }catch(e){console.error('ai-receivables error',e);return res.status(500).json({ok:false,error:'INTERNAL_ERROR',details:String(e?.message||e)})}
}
