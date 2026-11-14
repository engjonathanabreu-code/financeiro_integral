const { createHash } = require('node:crypto');
const { requestERP, erpUrl } = require('./auth');
const { aiError } = require('./ai-provider');
const MAX_FILE = 20 * 1024 * 1024;
const MAX_BASE64 = Math.ceil(MAX_FILE / 3) * 4;
const MAX_STORAGE_URL = 4096;
const SIGNED_PATH = /^\/storage\/v1\/object\/sign\/documentos\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/financeiro-analise\/([0-9a-f]{64})-[a-zA-Z0-9._-]+$/;
const tooLarge = () => aiError(413, 'FILE_TOO_LARGE', 'O arquivo deve ter até 20 MB.');
const invalidUrl = () => aiError(400, 'INVALID_FILE_URL', 'O endereço assinado do arquivo é inválido.');
const expiredUrl = () => aiError(400, 'FILE_URL_EXPIRED', 'Não foi possível acessar o arquivo. Envie novamente para renovar o acesso.');
const forbiddenFile = () => aiError(403, 'FILE_ACCESS_DENIED', 'O arquivo está indisponível para este perfil.');
const storageUnavailable = () => aiError(503, 'STORAGE_UNAVAILABLE', 'O armazenamento está indisponível. Tente novamente.');

function verifySignature(bytes, mime) {
  const starts = value => bytes.subarray(0, value.length).equals(value);
  const valid = {
    'application/pdf': () => starts(Buffer.from('%PDF-')),
    'image/jpeg': () => starts(Buffer.from('ffd8ff','hex')),
    'image/png': () => starts(Buffer.from('89504e470d0a1a0a','hex')),
    'image/webp': () => starts(Buffer.from('RIFF')) && bytes.subarray(8,12).toString() === 'WEBP',
    'image/gif': () => /^GIF8[79]a$/.test(bytes.subarray(0,6).toString())
  };
  if (!Object.hasOwn(valid,mime) || !valid[mime]()) {
    throw aiError(415, 'FILE_TYPE_INVALID', 'Tipo ou conteúdo do arquivo inválido.');
  }
}

async function downloadSignedFile(value, ownerId, authorization) {
  if (typeof value !== 'string' || value.length > MAX_STORAGE_URL) throw invalidUrl();
  let url;
  try { url = new URL(value); } catch { throw invalidUrl(); }
  const match = SIGNED_PATH.exec(url.pathname);
  const token = url.searchParams.get('token');
  if (url.origin !== new URL(erpUrl()).origin || url.username || url.password || url.hash || !match
      || [...url.searchParams].length !== 1 || !token || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw invalidUrl();
  const [, pathOwner, expectedHash] = match;
  if (!ownerId || pathOwner !== String(ownerId).toLowerCase() || !authorization) throw forbiddenFile();

  // O serviço verifica a assinatura. Conferir a expiração também localmente evita aceitar uma
  // resposta em cache depois de a URL perder validade.
  let expiration;
  try { expiration = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp; } catch { throw invalidUrl(); }
  if (!Number.isSafeInteger(expiration)) throw invalidUrl();
  if (expiration <= Math.floor(Date.now()/1000)) throw expiredUrl();

  // A URL assinada é uma credencial de portador. O info autenticado confere a RLS do mesmo objeto
  // antes de buscar os bytes. O JWT da sessão nunca é encaminhado na requisição da URL assinada.
  const infoPath = url.pathname.replace('/object/sign/', '/object/info/');
  let authorizationResult;
  try { authorizationResult = await requestERP(infoPath, authorization); } catch { throw storageUnavailable(); }
  if (!authorizationResult.ok) {
    if ([400,401,403,404].includes(authorizationResult.status)) throw forbiddenFile();
    throw storageUnavailable();
  }
  try {
    const info=await authorizationResult.json();
    if (Number(info.size ?? info.metadata?.size) > MAX_FILE) throw tooLarge();
  } catch(error) {
    if (error.code === 'FILE_TOO_LARGE') throw error;
    throw storageUnavailable();
  }

  try {
    const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      if ([400,401,403,404].includes(response.status)) throw expiredUrl();
      throw storageUnavailable();
    }
    if (Number(response.headers.get('content-length')) > MAX_FILE) {
      await response.body?.cancel();
      throw tooLarge();
    }
    if (!response.body) throw storageUnavailable();
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_FILE) throw tooLarge();
      chunks.push(chunk);
    }
    const mime = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const bytes = Buffer.concat(chunks,size);
    verifySignature(bytes,mime);
    if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
      throw aiError(422, 'FILE_HASH_MISMATCH', 'O original não confere com a referência. Selecione o arquivo novamente.');
    }
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch(error) {
    if (error.statusCode && error.code) throw error;
    throw storageUnavailable();
  }
}

async function resolveFile(body, key, ownerId, authorization) {
  if (body.fileUrl) return downloadSignedFile(body.fileUrl, ownerId, authorization);
  const value = body[key];
  const meta = typeof value === 'string' && /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i.exec(value);
  if (!meta) throw aiError(400, 'FILE_REQUIRED', 'Selecione um arquivo para análise.');
  const encoded = value.slice(meta[0].length);
  if (encoded.length > MAX_BASE64) throw tooLarge();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw aiError(400, 'INVALID_BASE64', 'O arquivo enviado está inválido.');
  }
  const bytes = Buffer.from(encoded,'base64');
  if (bytes.length > MAX_FILE) throw tooLarge();
  if (bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw aiError(400, 'INVALID_BASE64', 'O arquivo enviado está inválido.');
  }
  verifySignature(bytes, meta[1].toLowerCase());
  return value;
}

module.exports = { resolveFile, MAX_FILE };
