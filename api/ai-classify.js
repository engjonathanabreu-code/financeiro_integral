module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY_NOT_CONFIGURED' });

  try {
    const { rows = [], natures = [] } = req.body || {};
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ ok: false, error: 'ROWS_REQUIRED' });
    if (rows.length > 250) return res.status(400).json({ ok: false, error: 'TOO_MANY_ROWS' });

    const allowedNatures = Array.isArray(natures) && natures.length
      ? natures.map(String).filter(Boolean).slice(0, 80)
      : ['Despesa fixa','Despesa variável','Folha e encargos','Retirada e distribuição aos sócios','Tributos','Tarifas bancárias','Receita parcelada de clientes','Receita de contratos públicos','Receita avulsa de contratos privados','Outras receitas'];

    const cleanRows = rows.map((r, i) => ({
      index: i,
      date: String(r.date || ''),
      description: String(r.description || '').slice(0, 300),
      reference: String(r.reference || '').slice(0, 120),
      value: Number(r.value || 0),
      direction: r.direction === 'Entrada' ? 'Entrada' : 'Saída'
    }));

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        classifications: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              index: { type: 'integer' },
              nature: { type: 'string', enum: allowedNatures },
              normalized_description: { type: 'string' },
              confidence: { type: 'integer', minimum: 0, maximum: 100 },
              reason: { type: 'string' }
            },
            required: ['index','nature','normalized_description','confidence','reason']
          }
        }
      },
      required: ['classifications']
    };

    const prompt = [
      'Você é o agente financeiro interno da Integral Soluções em Engenharia.',
      'Classifique movimentações bancárias brasileiras usando SOMENTE as naturezas fornecidas.',
      'Regras importantes:',
      '- Créditos de MUNICIPIO, PREFEITURA, FUNDO MUNICIPAL ou CAMARA MUNICIPAL tendem a Receita de contratos públicos.',
      '- Créditos de cobrança, boleto, bolepix ou liquidação de cobrança tendem a Receita parcelada de clientes.',
      '- DARF, DAS, SIMPLES, FGTS, INSS, ISS, IRRF e similares são tributos.',
      '- Tarifas, manutenção de conta e serviços bancários são tarifas bancárias.',
      '- Salários, benefícios e encargos são folha e encargos.',
      '- Aluguel, software, seguro, contabilidade, empréstimos e serviços recorrentes tendem a despesa fixa.',
      '- Combustível, hotéis, restaurantes, locação de veículos, pedágios, materiais e manutenção tendem a despesa variável.',
      '- Não invente vínculo contratual quando a descrição não permitir concluir. Use a natureza genérica adequada com confiança menor.',
      '- normalized_description deve ser curta, legível e útil no fluxo de caixa, sem perder o nome do favorecido/pagador quando identificável.',
      `Naturezas permitidas: ${allowedNatures.join(' | ')}`,
      'Movimentações:',
      JSON.stringify(cleanRows)
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_FINANCE_MODEL || 'gpt-5.6-luna',
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'integral_bank_classification',
            strict: true,
            schema
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ ok: false, error: 'OPENAI_ERROR', details: data?.error?.message || 'Falha na OpenAI' });

    const outputText = data.output_text || (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === 'output_text')
      .map(item => item.text)
      .join('');

    const parsed = JSON.parse(outputText || '{}');
    return res.status(200).json({ ok: true, model: data.model, ...parsed });
  } catch (error) {
    console.error('ai-classify error', error);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', details: String(error?.message || error) });
  }
};
