module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
  if(!process.env.OPENAI_API_KEY) return res.status(500).json({ok:false,error:'OPENAI_API_KEY_NOT_CONFIGURED'});
  try{
    const {image,fileName='',sector='',context='',candidates=[]}=req.body||{};
    if(!image||typeof image!=='string'||!image.startsWith('data:')) return res.status(400).json({ok:false,error:'FILE_REQUIRED'});
    if(image.length>12000000) return res.status(413).json({ok:false,error:'FILE_TOO_LARGE'});
    const clean=(Array.isArray(candidates)?candidates:[]).slice(0,200).map(c=>({id:String(c.id||''),date:String(c.date||''),description:String(c.description||'').slice(0,180),value:Number(c.value||0),source:String(c.source||'')}));
    const schema={type:'object',additionalProperties:false,properties:{value:{type:'number'},expense_type:{type:'string'},origin:{type:'string'},description:{type:'string'},date:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},duplicate:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{id:{type:'string'},label:{type:'string'},reason:{type:'string'}},required:['id','label','reason']}]},notes:{type:'string'}},required:['value','expense_type','origin','description','date','confidence','duplicate','notes']};
    const travel=context==='viagem';
    const prompt=travel
      ?`Você é o agente financeiro interno da Integral Soluções em Engenharia responsável por prestação de contas de viagens. Leia o documento e extraia: valor total efetivamente pago, tipo da despesa, fornecedor/origem, descrição curta e data em YYYY-MM-DD. Classifique o tipo preferencialmente como Hospedagem, Combustível, Alimentação, Pedágio, Passagem, Estacionamento, Transporte, Material ou Outros. Não invente valores. Se o documento não comprovar pagamento, use valor 0 e explique em notes. Compare com as despesas já registradas nesta viagem e só marque duplicidade com forte coincidência de valor, data e origem/descrição. Setor: ${sector||'não informado'}. Arquivo: ${fileName}. Despesas existentes: ${JSON.stringify(clean)}`
      :`Você é o agente financeiro interno da Integral Soluções em Engenharia. Leia o comprovante anexado e extraia valor total pago, tipo da despesa, origem/fornecedor/favorecido, descrição curta e data em YYYY-MM-DD. Compare com os registros existentes. Só marque duplicidade quando houver forte coincidência de valor e origem/descrição, preferencialmente com data próxima. Setor do orçamento: ${sector||'não informado'}. Arquivo: ${fileName}. Registros existentes: ${JSON.stringify(clean)}`;
    const isPdf=/^data:application\/pdf[;,]/i.test(image)||/\.pdf$/i.test(fileName);
    const filePart=isPdf?{type:'input_file',file_data:image,filename:fileName||'documento.pdf'}:{type:'input_image',image_url:image};
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_FINANCE_MODEL||'gpt-5.6-luna',input:[{role:'user',content:[{type:'input_text',text:prompt},filePart]}],text:{format:{type:'json_schema',name:'integral_receipt_analysis',strict:true,schema}}})});
    const data=await response.json();if(!response.ok)return res.status(response.status).json({ok:false,error:'OPENAI_ERROR',details:data?.error?.message||'Falha na OpenAI'});
    const outputText=data.output_text||(data.output||[]).flatMap(i=>i.content||[]).filter(i=>i.type==='output_text').map(i=>i.text).join('');
    return res.status(200).json({ok:true,model:data.model,...JSON.parse(outputText||'{}')});
  }catch(error){console.error('ai-receipt error',error);return res.status(500).json({ok:false,error:'INTERNAL_ERROR',details:String(error?.message||error)});}
};
