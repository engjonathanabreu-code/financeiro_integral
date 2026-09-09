module.exports=async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!process.env.OPENAI_API_KEY)return res.status(500).json({ok:false,error:'OPENAI_API_KEY_NOT_CONFIGURED'});
 try{
  const {file,fileName='arquivo',mode='payments'}=req.body||{};
  if(!file||!String(file).startsWith('data:'))return res.status(400).json({ok:false,error:'FILE_REQUIRED'});
  if(file.length>16000000)return res.status(413).json({ok:false,error:'FILE_TOO_LARGE'});
  const configured=String(process.env.OPENAI_FINANCE_MODEL||'').trim();
  let schema,prompt,name,model;
  if(mode==='clients'){
   model=!configured||configured==='gpt-5.6-luna'?'gpt-5-mini':configured;
   const client={type:'object',additionalProperties:false,properties:{municipio:{type:'string'},uf:{type:'string'},nome:{type:'string'},cpf_cnpj:{type:'string'},codigo:{type:'string'},valor_global:{type:'number'},valor_entrada:{type:'number'},numero_parcelas:{type:'integer'},valor_parcela:{type:'number'},primeiro_vencimento:{type:'string'},dia_vencimento:{type:'integer'}},required:['municipio','uf','nome','cpf_cnpj','codigo','valor_global','valor_entrada','numero_parcelas','valor_parcela','primeiro_vencimento','dia_vencimento']};
   schema={type:'object',additionalProperties:false,properties:{clients:{type:'array',items:client}},required:['clients']};name='integral_receivables_clients';
   prompt='Leia integralmente esta planilha de clientes/recebimentos da Integral e extraia uma linha por cliente/contrato. Preserve município, UF, nome, CPF/CNPJ e código quando existirem. Extraia valor global, entrada, número de parcelas, valor da parcela, primeiro vencimento em YYYY-MM-DD e dia de vencimento. Quando um campo não existir use string vazia ou zero; não invente dados. Não extraia cabeçalhos, totais ou linhas vazias.';
  }else{
   if(!String(file).startsWith('data:application/pdf'))return res.status(400).json({ok:false,error:'PDF_REQUIRED'});
   /* Relatórios bancários podem conter centenas de liquidações. O modelo devolve linhas compactas
      para reduzir drasticamente tokens de saída e evitar timeout da função Vercel. */
   model='gpt-5-mini';
   const row={type:'array',prefixItems:[{type:'string'},{type:'string'},{type:'string'},{type:'string'},{type:'number'},{type:'number'}],minItems:6,maxItems:6};
   schema={type:'object',additionalProperties:false,properties:{rows:{type:'array',items:row}},required:['rows']};name='integral_receivables_report_compact';
   prompt='Leia integralmente o relatório bancário. Extraia SOMENTE registros da seção de LIQUIDACAO/títulos efetivamente pagos. Para cada boleto retorne exatamente: [nome do pagador, documento/código do boleto, vencimento YYYY-MM-DD, data de pagamento YYYY-MM-DD, valor nominal, valor pago]. Preserve cada vencimento separadamente, inclusive meses futuros e múltiplos títulos do mesmo cliente. Ignore Entrada Confirmada, TOTAL, cabeçalhos e demais ocorrências. Não invente dados.';
  }
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_file',file_data:file,filename:fileName}]}],text:{format:{type:'json_schema',name,strict:true,schema}}})});
  const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{return res.status(502).json({ok:false,error:'OPENAI_INVALID_RESPONSE',details:'A OpenAI retornou uma resposta inválida.'})}
  if(!response.ok)return res.status(response.status).json({ok:false,error:'OPENAI_ERROR',details:data?.error?.message||'Falha na OpenAI',model});
  const text=data.output_text||(data.output||[]).flatMap(i=>i.content||[]).filter(i=>i.type==='output_text').map(i=>i.text).join('');let parsed={};try{parsed=JSON.parse(text||'{}')}catch{return res.status(502).json({ok:false,error:'OPENAI_OUTPUT_INVALID',details:'Não foi possível interpretar o arquivo retornado pela IA.'})}
  if(mode!=='clients'){
   const entries=(parsed.rows||[]).map(r=>({pagador:String(r?.[0]||''),cpf_cnpj:'',nosso_numero:'',documento:String(r?.[1]||''),vencimento:String(r?.[2]||''),pagamento:String(r?.[3]||''),valor_nominal:Number(r?.[4]||0),valor_liquidado:Number(r?.[5]||0)}));
   return res.status(200).json({ok:true,model:data.model||model,entries});
  }
  return res.status(200).json({ok:true,model:data.model||model,...parsed});
 }catch(e){console.error('ai-receivables error',e);return res.status(500).json({ok:false,error:'INTERNAL_ERROR',details:String(e?.message||e)})}
}