module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({connected:false,error:'METHOD_NOT_ALLOWED'});
  if(!process.env.OPENAI_API_KEY)return res.status(500).json({connected:false,error:'OPENAI_API_KEY_NOT_CONFIGURED'});
  const configured=String(process.env.OPENAI_FINANCE_MODEL||'').trim();
  const model=configured||'gpt-5.6-luna';
  try{
    const started=Date.now();
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,input:'Responda somente com OK.',max_output_tokens:8})
    });
    const data=await response.json();
    if(!response.ok)return res.status(response.status).json({connected:false,error:'OPENAI_ERROR',details:data?.error?.message||'Falha na OpenAI',model});
    return res.status(200).json({connected:true,model:data.model||model,latencyMs:Date.now()-started});
  }catch(error){
    console.error('ai-health error',error);
    return res.status(500).json({connected:false,error:'INTERNAL_ERROR',details:String(error?.message||error),model});
  }
};
