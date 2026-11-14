const { requireProfile } = require('../lib/auth');
const { reserveAIQuota } = require('../lib/ai-quota');
const { TIMEOUTS, noKey, outputText, providerData, invalidResponse, sendError } = require('../lib/ai-provider');

module.exports = async function handler(req,res) {
  res.setHeader?.('Cache-Control','private, no-store');
  const method = req.method;
  if (!['GET','POST'].includes(method)) {
    res.setHeader?.('Allow','GET, POST');
    return res.status(405).json({ connected:false, error:'METHOD_NOT_ALLOWED' });
  }
  if (!await requireProfile(req,res,method==='GET'?'ativo':'admin')) return;
  const configured = Boolean(process.env.OPENAI_API_KEY);
  const model = String(process.env.OPENAI_FINANCE_MODEL || '').trim() || 'gpt-5.6-luna';
  if (method === 'GET') return res.status(200).json({
    ok:true, configured, tested:false, connected:null, model:configured?model:null
  });

  if (!configured) return sendError(res,noKey(),{health:true});
  if (!await reserveAIQuota(req,res,'conexao')) return;
  try {
    const started = Date.now();
    const data = await providerData({
      model, input:'Responda somente com OK.', max_output_tokens:32
    }, TIMEOUTS.health);
    if (!/^ok[.!]?$/i.test(outputText(data).trim())) throw invalidResponse();
    return res.status(200).json({ ok:true, configured:true, tested:true, connected:true, model:data.model||model, latencyMs:Date.now()-started });
  } catch(error) {
    return sendError(res,error,{health:true});
  }
};
