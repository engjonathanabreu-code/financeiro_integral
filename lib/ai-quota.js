const { requestERP } = require('./auth');

async function reserveAIQuota(req, res, route, { agent = false } = {}) {
  let status = 503;
  let error = 'AI_QUOTA_UNAVAILABLE';
  let details = 'Não foi possível confirmar a cota de IA. Tente novamente.';
  try {
    const response = await requestERP('/rest/v1/rpc/financeiro_reservar_cota_ia', req.headers.authorization, {
      method: 'POST',
      body: JSON.stringify({ p_rota: route }),
    });
    if (response.ok) {
      const allowed = await response.json();
      if (allowed === true) return true;
      if (allowed === false) {
        status = 429;
        error = 'AI_QUOTA_EXCEEDED';
        details = 'Limite diário de IA atingido para esta função. A cota renova à meia-noite de Brasília.';
      }
    } else if ([401, 403].includes(response.status)) {
      status = response.status;
      error = 'AI_QUOTA_FORBIDDEN';
      details = 'Sua sessão não está autorizada para esta função de IA. Confira o acesso ou entre novamente.';
    }
  } catch {
    // Sem confirmação da reserva, a solicitação termina antes de usar o provedor.
  }
  res.status(status).json(agent ? { erro: details, codigo: error } : { ok: false, error, details });
  return false;
}

module.exports = { reserveAIQuota };
