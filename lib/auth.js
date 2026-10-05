/* Confere a sessão do Supabase do ERP antes de usar a chave da OpenAI.
   Sem isso, qualquer pessoa na internet conseguia chamar as rotas /api/ai-*. */
const SUPABASE_URL=(process.env.ERP_SUPABASE_URL||'https://ycdsyilyvaxslkwbkxyo.supabase.co').replace(/\/$/,'');
const PUBLISHABLE_KEY=process.env.ERP_SUPABASE_KEY||'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4';
const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

async function read(path,authorization){
  const r=await fetch(SUPABASE_URL+path,{headers:{Authorization:authorization,apikey:PUBLISHABLE_KEY},signal:AbortSignal.timeout(10000)});
  if(!r.ok)return null;
  return r.json();
}

function isFinance(profile){return norm(profile?.tipo)==='administrador'||norm(profile?.tipo)==='financeiro'||norm(profile?.setor)==='financeiro'}

/* access: 'ativo' (qualquer usuário ativo) | 'financeiro' (ADM ou setor Financeiro) | 'admin' */
async function requireProfile(req,res,access='ativo'){
  const fail=(status,error,details)=>{res.status(status).json({ok:false,error,details});return null};
  const authorization=String(req.headers?.authorization||'');
  if(!/^Bearer \S+$/.test(authorization))return fail(401,'UNAUTHENTICATED','Entre novamente no sistema para usar a IA.');
  if(req.headers?.origin&&req.headers?.host){try{if(new URL(req.headers.origin).host!==req.headers.host)return fail(403,'FORBIDDEN_ORIGIN','Origem não autorizada.')}catch{return fail(403,'FORBIDDEN_ORIGIN','Origem não autorizada.')}}
  let identity=null,profiles=null;
  try{
    identity=await read('/auth/v1/user',authorization);
    if(identity?.id)profiles=await read('/rest/v1/profiles?select=id,tipo,setor,ativo&id=eq.'+encodeURIComponent(identity.id),authorization);
  }catch{return fail(503,'AUTH_UNAVAILABLE','Não foi possível confirmar sua sessão. Tente novamente.')}
  if(!identity?.id)return fail(401,'UNAUTHENTICATED','Sua sessão expirou. Entre novamente.');
  const profile=(Array.isArray(profiles)?profiles:[]).find(p=>p.ativo===true);
  if(!profile)return fail(403,'FORBIDDEN','Usuário inativo ou sem perfil no ERP.');
  if(access==='admin'&&norm(profile.tipo)!=='administrador')return fail(403,'FORBIDDEN','Disponível somente para administradores.');
  if(access==='financeiro'&&!isFinance(profile))return fail(403,'FORBIDDEN','Disponível somente para o Financeiro.');
  return {user:identity,profile};
}

module.exports={requireProfile,isFinance};
