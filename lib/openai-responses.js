/* Chamada única à Responses API usada pelas rotas /api/ai-* (FIN-12).
   Cada rota continua escolhendo modelo, prompt e esquema; aqui ficam o que todas precisam:
   tempo limite, resposta incompleta ou inválida, métricas (tokens e latência) e erro sem
   detalhes internos para o navegador. */
const ENDPOINT='https://api.openai.com/v1/responses';
const TIMEOUT_MS=120000;   // abaixo do maxDuration (150 s) declarado nas rotas

const fail=(statusCode,code,message,extra={})=>Object.assign(new Error(message),{statusCode,code,...extra});
function outputText(data){return data?.output_text||(data?.output||[]).flatMap(i=>i.content||[]).filter(i=>i.type==='output_text').map(i=>i.text).join('')}

async function callResponses(body,{label='openai',timeoutMs=TIMEOUT_MS,json=true}={}){
  const started=Date.now();
  let response;
  try{
    response=await fetch(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
  }catch(e){
    if(e?.name==='TimeoutError'||e?.name==='AbortError')throw fail(504,'OPENAI_TIMEOUT','A IA demorou demais para responder. Tente novamente.');
    throw fail(502,'OPENAI_UNAVAILABLE','A IA está indisponível no momento. Tente novamente.');
  }
  const data=await response.json().catch(()=>null);
  const metrics={label,model:data?.model||body.model,status:response.status,durationMs:Date.now()-started,inputTokens:data?.usage?.input_tokens,outputTokens:data?.usage?.output_tokens};
  if(!response.ok){console.error('openai error',metrics);throw fail(response.status,'OPENAI_ERROR',data?.error?.message||'Falha na OpenAI',{model:body.model})}
  if(data?.status==='incomplete'){console.error('openai incomplete',{...metrics,reason:data?.incomplete_details?.reason});throw fail(502,'OPENAI_INCOMPLETE','A IA não concluiu a leitura (resposta incompleta). Tente um arquivo menor ou novamente.')}
  console.info('openai ok',metrics);
  if(!json)return {data,text:outputText(data)};
  let parsed;
  try{parsed=JSON.parse(outputText(data))}catch{throw fail(502,'OPENAI_INVALID_OUTPUT','A IA devolveu uma resposta em formato inválido. Tente novamente.')}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw fail(502,'OPENAI_INVALID_OUTPUT','A IA devolveu uma resposta em formato inválido. Tente novamente.');
  return {data,parsed};
}

/* Resposta de erro para o navegador: mensagem pública, sem pilha nem detalhes de implementação. */
function sendError(res,error,label,extra={}){
  const known=['OPENAI_TIMEOUT','OPENAI_UNAVAILABLE','OPENAI_ERROR','OPENAI_INCOMPLETE','OPENAI_INVALID_OUTPUT','PAYLOAD_TOO_LARGE'];
  if(!known.includes(error?.code)&&error?.statusCode!==413)console.error(`${label} error`,error);
  const code=known.includes(error?.code)?error.code:(error?.statusCode===413?'PAYLOAD_TOO_LARGE':'INTERNAL_ERROR');
  const details=code==='INTERNAL_ERROR'?'Não foi possível concluir a análise. Tente novamente.':error.message;
  return res.status(error?.statusCode||500).json({ok:false,error:code,details,...(error?.model?{model:error.model}:{}),...extra});
}

module.exports={callResponses,sendError,outputText,TIMEOUT_MS};
