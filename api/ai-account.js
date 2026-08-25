module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  if(!process.env.OPENAI_API_KEY)return res.status(500).json({ok:false,error:'OPENAI_API_KEY_NOT_CONFIGURED'});
  try{
    const {image,fileName='',accounts=[]}=req.body||{};
    if(!image||typeof image!=='string'||!image.startsWith('data:'))return res.status(400).json({ok:false,error:'FILE_REQUIRED'});
    if(image.length>10000000)return res.status(413).json({ok:false,error:'FILE_TOO_LARGE'});

    const mime=(image.match(/^data:([^;,]+)/i)||[])[1]?.toLowerCase()||'';
    const isPdf=mime==='application/pdf'||/\.pdf$/i.test(fileName);
    const isImage=mime.startsWith('image/');
    if(!isPdf&&!isImage)return res.status(415).json({ok:false,error:'UNSUPPORTED_FILE_TYPE',details:'Envie PDF, JPG, JPEG, PNG ou WEBP.'});

    const clean=(Array.isArray(accounts)?accounts:[]).slice(0,300).map(a=>({
      id:String(a.id||''),name:String(a.name||'').slice(0,120),supplier:String(a.supplier||'').slice(0,120),registration:String(a.registration||'').slice(0,100),category:String(a.category||''),sector:String(a.sector||'')
    }));

    const accountSchema={type:'object',additionalProperties:false,properties:{
      matchedAccountId:{type:'string'},name:{type:'string'},supplier:{type:'string'},registration:{type:'string'},category:{type:'string'},sector:{type:'string'},
      recurrence:{type:'string',enum:['Mensal','Bimestral','Trimestral','Semestral','Anual','Eventual','Não identificada']},paymentMethod:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},notes:{type:'string'}
    },required:['matchedAccountId','name','supplier','registration','category','sector','recurrence','paymentMethod','confidence','notes']};
    const paymentSchema={type:'object',additionalProperties:false,properties:{value:{type:'number'},dueDate:{type:'string'},paymentCode:{type:'string'},competence:{type:'string'},notes:{type:'string'}},required:['value','dueDate','paymentCode','competence','notes']};
    const schema={type:'object',additionalProperties:false,properties:{account:accountSchema,payments:{type:'array',items:paymentSchema,minItems:1}},required:['account','payments']};

    const prompt=`Você é o agente financeiro interno da Integral Soluções em Engenharia. Analise TODO o arquivo anexado, incluindo TODAS as páginas. Um único PDF pode conter vários boletos/faturas da mesma conta, inclusive de competências e vencimentos diferentes. Extraia TODOS os pagamentos encontrados, sem parar no primeiro. Para a conta, identifique fornecedor, nome, matrícula/número da unidade consumidora/número do cliente, recorrência, forma de pagamento, categoria e setor quando houver evidência. Compare com as contas já cadastradas: priorize matrícula/identificador + fornecedor; sem identificador, só vincule quando fornecedor e nome forem claramente equivalentes. Se houver correspondência, retorne o id em account.matchedAccountId; caso contrário deixe vazio. Em payments, crie UM ITEM PARA CADA boleto/fatura/competência encontrado no arquivo, com valor, vencimento YYYY-MM-DD, código de pagamento quando existir e competência YYYY-MM. Não invente dados. Se houver 6 boletos no PDF, payments deve conter 6 itens. Arquivo: ${fileName}. Contas existentes: ${JSON.stringify(clean)}`;

    const attachment=isPdf?{type:'input_file',filename:fileName||'conta.pdf',file_data:image}:{type:'input_image',image_url:image};
    const configured=String(process.env.OPENAI_FINANCE_MODEL||'').trim();
    const model=configured||'gpt-5.6-luna';
    const started=Date.now();
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:prompt},attachment]}],text:{format:{type:'json_schema',name:'integral_account_analysis_batch',strict:true,schema}}})
    });
    const data=await response.json();
    if(!response.ok){
      console.error('ai-account OpenAI error',{status:response.status,fileName,mime,model,details:data?.error?.message});
      return res.status(response.status).json({ok:false,error:'OPENAI_ERROR',details:data?.error?.message||'Falha na OpenAI',model});
    }
    const outputText=data.output_text||(data.output||[]).flatMap(i=>i.content||[]).filter(i=>i.type==='output_text').map(i=>i.text).join('');
    const parsed=JSON.parse(outputText||'{}');
    const payments=Array.isArray(parsed.payments)?parsed.payments:[];
    console.info('ai-account success',{fileName,input:isPdf?'pdf':'image',model:data.model||model,matched:!!parsed.account?.matchedAccountId,payments:payments.length,confidence:parsed.account?.confidence,durationMs:Date.now()-started});
    return res.status(200).json({ok:true,model:data.model||model,inputType:isPdf?'pdf':'image',account:parsed.account||{},payments});
  }catch(error){
    console.error('ai-account error',error);
    return res.status(500).json({ok:false,error:'INTERNAL_ERROR',details:String(error?.message||error)});
  }
};
