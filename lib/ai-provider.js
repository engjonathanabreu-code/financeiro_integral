const TIMEOUTS = Object.freeze({ document: 45000, health: 10000, chat: 85000, report: 110000 });

function aiError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function providerError(error) {
  if (error?.statusCode && error?.code) return error;
  if (['TimeoutError', 'AbortError'].includes(error?.name)) {
    return aiError(504, 'AI_TIMEOUT', 'A análise excedeu o tempo limite. Tente novamente ou revise o original manualmente.');
  }
  return aiError(503, 'AI_UNAVAILABLE', 'A IA está indisponível. Tente novamente ou revise o original manualmente.');
}

function invalidResponse() {
  return aiError(502, 'AI_INVALID_RESPONSE', 'A IA não concluiu a análise. Revise o original ou tente novamente.');
}

function sendError(res, error, { agent = false, health = false } = {}) {
  const e = providerError(error);
  return res.status(e.statusCode).json(agent
    ? { erro: e.message, codigo: e.code }
    : { ok: false, ...(health ? { connected: false } : {}), error: e.code, details: e.message });
}

function noKey() {
  return aiError(503, 'OPENAI_API_KEY_NOT_CONFIGURED', 'A IA ainda não está configurada no servidor.');
}

async function requestProvider(body, timeout = TIMEOUTS.document) {
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw providerError();
    }
    return response;
  } catch (error) {
    throw providerError(error);
  }
}

function outputText(data) {
  if (data?.status && data.status !== 'completed') throw invalidResponse();
  if (typeof data?.output_text === 'string') return data.output_text;
  return (Array.isArray(data?.output) ? data.output : [])
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .filter(item => item?.type === 'output_text' && typeof item.text === 'string').map(item => item.text).join('\n');
}

async function providerData(body, timeout) {
  const response = await requestProvider(body, timeout);
  try {
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data) || !outputText(data)) throw invalidResponse();
    return data;
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error?.name)) throw providerError(error);
    throw invalidResponse();
  }
}

function parseOutput(data) {
  try {
    const parsed = JSON.parse(outputText(data));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalidResponse();
    return parsed;
  } catch {
    throw invalidResponse();
  }
}

module.exports = { TIMEOUTS, aiError, invalidResponse, noKey, outputText, parseOutput, providerData, providerError, requestProvider, sendError };
