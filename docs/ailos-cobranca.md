# Cobrança Ailos no Financeiro Integral

A aba **Gerar Boletos** permite emitir parcelas existentes ou criar um novo boleto/carnê para um cliente cadastrado. A tela começa apenas com **Buscar cliente**, que pesquisa nome (sem diferenciar acentos), CPF com ou sem pontuação, código e núcleo vinculado no Integração. A busca é paginada no servidor. As opções de configuração e retorno ficam em **Gerenciar cobranças**. Os campos `nosso_numero`, `documento` e `linha_digitavel` são gravados nas mesmas `fin_receb_parcelas` consultadas pelo Integração. O retorno de liquidação atualiza status, data e valor recebido nessa base; os gatilhos existentes incrementam a versão e avisam o Integração.

## Antes da primeira cobrança

Solicitar à cooperativa:

- Confirmação de habilitação para **CNAB 240 / cooperado emite e distribui**, código de banco 085.
- Convênio de seis dígitos, agência e dígito, conta e dígito, carteira 01.
- Último número de boleto e de remessa efetivamente utilizados, inclusive em outros programas. Nunca preencher zero por suposição.
- Procedimento de envio de arquivos e de obtenção dos retornos, além do protocolo de homologação.
- Se houver oferta de API, solicitar separadamente sua documentação. O ZIP fornecido não documenta API, autenticação, webhooks ou consulta online.

Não são necessárias senhas do banco no Financeiro para este fluxo por arquivos.

## Operação

1. Em **Convênio e configuração**, preencher os dados reais e manter Homologação. Informar razão social e endereço do beneficiário. A identidade bancária fica bloqueada depois da primeira reserva; não alterar banco/conta de títulos em circulação.
2. Conferir CPF/CNPJ e nome do cliente em Recebimentos. Ao selecionar o cliente, o endereço do Integração é carregado automaticamente (logradouro, número, complemento, bairro, CEP, município e UF). Confira os dados exibidos e complete o que faltar em **Completar endereço de cobrança**. Ajustes salvos especificamente para cobrança têm preferência e não alteram o cadastro original. Endereços longos ou incompatíveis com o layout bancário devem ser revisados, sem corte automático. A remessa e o PDF preservam o endereço da emissão, mesmo que o cadastro mude depois.
3. Selecionar o cliente. Para emitir cobranças existentes, selecionar parcelas futuras, pendentes e sem boleto existente. O valor nominal inclui o valor base mais juros/multa já lançados na parcela. Não há acréscimos futuros, descontos ou protesto nesta implementação.
4. Gerar a remessa `.REM` e os PDFs de homologação. Encaminhar os testes somente ao canal de homologação indicado pela cooperativa; o CNAB de teste tem a mesma estrutura bancária e não deve ser enviado ao processamento de produção. A troca de arquivos com o Conta Online é feita pelo operador. O sistema não envia arquivos ao banco nem aos pagadores.
5. Encaminhar amostras à cooperativa e obter aprovação. Só então marcar a confirmação de homologação, registrar a referência e escolher Produção. Testes usam numeração reservada e crescente, sem alterar valores ou pagamentos reais.
6. Em Produção, baixar e enviar a remessa. Importar o retorno de registro. **Gerado não significa registrado nem pago.** O PDF para cobrança só é liberado para títulos com registro aceito e em aberto. Uma remessa com rejeições libera somente os PDFs dos títulos registrados.
7. Importar os retornos de pagamento e conferir a prévia. O valor recebido é o **valor pago pelo pagador**, não o crédito líquido após tarifas. Retornos repetidos são idempotentes. Divergências abortam a operação inteira, sem conciliar parte do arquivo.
8. Usar o histórico para recuperar o mesmo arquivo após falha de download. Não criar outra cobrança para tentar recuperar um download.

## Novos boletos e carnês

Após selecionar o cliente, escolher **Novo boleto ou carnê**, informar a quantidade (1 a 500), o valor de cada parcela, a primeira data e vencimentos **Mensais** ou **Todos na mesma data**. A prévia mostra todas as parcelas e o total antes da geração. Mensais preservam o dia original, limitando-o ao último dia dos meses mais curtos. Mesmo valor e vencimento são permitidos; cada título recebe seu próprio nosso número.

Em produção, finalizar a remessa cria as novas parcelas no mesmo `cliente_id` compartilhado com o Integração. Números de parcela continuam após a maior numeração existente. Se já houver parcelas em aberto, é necessário marcar que se deseja adicionar novas cobranças, para não confundir emissão de dívida existente com criação de dívida adicional. Valores gerais do contrato não são reescritos. Em homologação não se criam parcelas, nem dívidas ou pagamentos reais.

A reserva e a finalização são transacionais e idempotentes. Uma falha no meio da finalização não cria parte das parcelas. Falhas de download podem ser recuperadas no histórico. No histórico, **Boletos PDF** produz uma página com recibo por título, e **Carnê PDF** produz duas fichas numeradas por página, agrupadas por cliente. Em produção, ambos incluem apenas títulos registrados e em aberto; a tela informa quando outros títulos ficaram de fora. Imprimir em tamanho real, sem redimensionamento. A cooperativa deve homologar também o modelo de carnê.

## Escopo e limitações

- Implementado CNAB 240 Ailos, manual v14 de maio de 2025 e as dicas de homologação recebidas. O exemplo `.rem` do ZIP usa versões antigas diferentes; o gerador segue as versões 084/043 do manual.
- Segmentos P/Q para entrada de cobrança simples; espécie duplicata de serviço, sem aceite, juros futuros, multa futura, desconto ou protesto. Não gera CNAB 400.
- No segmento P, a posição 142 recebe `0` (isenção de desconto); a data e o valor do desconto, posições 143–165, ficam zerados. O código `1` exige desconto em reais e data correspondente, funcionalidade ainda não disponível nesta versão.
- Retorno T/U: 02 registro, 03 rejeição, 06/17 liquidação, 09 baixa bancária. Outros códigos permanecem para conferência, sem baixa financeira automática. Baixa bancária não cancela o contrato ou a parcela a receber.
- Retorno com valor inferior ao nominal cria pagamento parcial para conferência. Pagamento já existente, divergência de cadastro, parcela alterada/inativa/cancelada ou segundo evento de liquidação diferente exige análise; não há sobrescrita silenciosa.
- Não implementa API, Pix, alterações/baixas por remessa, reemissão de título rejeitado, múltiplos convênios ou criação de novos contratos. Corrigir títulos já emitidos exige conciliação operacional com a cooperativa antes de novos comandos.
- O histórico guarda até 100 remessas na listagem. Downloads guardam o conteúdo original. A reserva de números é persistente e transacional, nunca feita no armazenamento local do navegador.
- O PDF usa a marca Ailos enviada pela cooperativa em 01/10/2026, com a proporção original, no recibo e na ficha de compensação (manual v14, páginas 5 e 7). A atualização visual não altera o snapshot, a numeração nem o conteúdo de remessas existentes.
- O PDF segue o desenho bancário e código 2 de 5 intercalado, com barras de 103 × 13 mm. A leitura física e aceitação definitiva dependem da homologação bancária.

## Instalação e testes

Aplicar uma única vez `supabase/ailos-cobranca.sql` e depois `supabase/ailos-carnes.sql` e `supabase/ailos-busca-performance.sql` e `supabase/ailos-endereco-cliente.sql` ao projeto do ERP/Financeiro, depois publicar os arquivos do site. A instalação é aditiva: não configura convênios nem altera parcelas existentes. As tabelas ficam no schema privado `ailos_privado`, com RLS e sem acesso direto. A função pública invoker delega à função privada que exige sessão ativa e perfil Administrador/Financeiro ou setor Financeiro. Sem chaves privilegiadas no navegador.

`pnpm install --frozen-lockfile` e `pnpm test:ailos` verificam layout, fator de vencimento, validações, retorno truncado ou de outra conta, autorização, transação, reserva idempotente, separação de homologação/produção pagamento compartilhado sem repetição, buscas por núcleo/CPF/nome/código, vencimentos mensais e repetidos, criação atômica de carnês e ausência de dívida em homologação. `pnpm test` executa as demais regressões do repositório.

Referência de autorização de funções: https://supabase.com/docs/guides/database/functions
