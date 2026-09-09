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
    const extractionRules=`REGRAS DE LEITURA DE CUPOM/NFC-e/RECIBO:\n- Priorize o campo TOTAL, VALOR TOTAL, TOTAL R$, VALOR PAGO ou equivalente como value.\n- Não confunda value com tributos aproximados, troco, desconto isolado, número de caixa, COO/CCF, protocolo, chave de acesso, CNPJ/CPF, número da NFC-e ou preço unitário.\n- Quando houver subtotal e total sem desconto/acréscimo, use o TOTAL.\n- Em cupons de alimentação, use expense_type=Alimentação. Combustível, hospedagem, pedágio, estacionamento e transporte devem ser classificados pela natureza real do documento.\n- origin deve ser o nome comercial/razão social do estabelecimento, não o CNPJ nem o endereço.\n- description deve resumir o que foi comprado. Quando os itens estiverem legíveis, cite os principais itens sem copiar informações fiscais irrelevantes.\n- date deve ser a data de emissão/compra em YYYY-MM-DD. Se houver data e hora de emissão e autorização, prefira a data de emissão.\n- Se o documento estiver parcialmente legível, extraia apenas o que estiver sustentado visualmente e reduza confidence em vez de inventar.\n- Um documento fiscal válido com forma de pagamento e total claramente visíveis comprova a despesa, mesmo sem a palavra literal \"pago\".`;
    const prompt=travel
      ?`Você é o agente financeiro interno da Integral Soluções em Engenharia responsável por prestação de contas de viagens. Leia visualmente o documento anexado e extraia os dados financeiros principais. ${extractionRules}\nClassifique o tipo preferencialmente como Hospedagem, Combustível, Alimentação, Pedágio, Passagem, Estacionamento, Transporte, Material ou Outros. Compare com as despesas já registradas nesta viagem e só marque duplicidade com forte coincidência de valor, data e origem/descrição. Setor: ${sector||'não informado'}. Arquivo: ${fileName}. Despesas existentes: ${JSON.stringify(clean)}`
      :`Você é o agente financeiro interno da Integral Soluções em Engenharia. Leia visualmente o comprovante anexado e extraia valor total pago, tipo da despesa, origem/fornecedor/favorecido, descrição curta e data em YYYY-MM-DD. ${extractionRules}\nCompare com os registros existentes. Só marque duplicidade quando houver forte coincidência de valor e origem/descrição, preferencialmente com data próxima. Setor do orçamento: ${sector||'não informado'}. Arquivo: ${fileName}. Registros existentes: ${JSON.stringify(clean)}`;
    const isPdf=/^data:application\/pdf[;,]/i.test(image)||/\.pdf$/i.test(fileName);
    const filePart=isPdf?{type:'input_file',file_data:image,filename:fileName||'documento.pdf'}:{type:'input_image',image_url:image};
    const configured=String(process.env.OPENAI_FINANCE_MODEL||'').trim();
    const model=!configured||configured==='gpt-5.6-luna'?'gpt-5-mini':configured;
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:prompt},filePart]}],text:{format:{type:'json_schema',name:'integral_receipt_analysis',strict:true,schema}}})});
    const data=await response.json();if(!response.ok)return res.status(response.status).json({ok:false,error:'OPENAI_ERROR',details:data?.error?.message||'Falha na OpenAI',model});
    const outputText=data.output_text||(data.output||[]).flatMap(i=>i.content||[]).filter(i=>i.type==='output_text').map(i=>i.text).join('');
    const parsed=JSON.parse(outputText||'{}');
    if(!Number.isFinite(Number(parsed.value))||Number(parsed.value)<0) parsed.value=0;
    if(typeof parsed.date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(parsed.date)) parsed.date='';
    return res.status(200).json({ok:true,model:data.model||model,...parsed});
  }catch(error){console.error('ai-receipt error',error);return res.status(500).json({ok:false,error:'INTERNAL_ERROR',details:String(error?.message||error)});}
};
