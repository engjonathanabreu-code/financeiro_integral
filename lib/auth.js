/* Confere a sessão do Supabase do ERP antes de usar a chave da OpenAI.
   Sem isso, qualquer pessoa na internet conseguia chamar as rotas /api/ai-*. */
const erpUrl=()=>(process.env.ERP_SUPABASE_URL||'https://ycdsyilyvaxslkwbkxyo.supabase.co').replace(/\/$/,'');
const publishableKey=()=>process.env.ERP_SUPABASE_KEY||'sb_publishable_A7fw5Et4_bfUnqohpGajCw_nfhT-3a4';
const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

function requestERP(path,authorization,{method='GET',body,timeout=10000}={}){
  const headers={Authorization:authorization,apikey:publishableKey(),'Cache-Control':'no-cache'};
  if(body!==undefined)headers['Content-Type']='application/json';
  return fetch(erpUrl()+path,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(timeout)});
}
async function read(path,authorization){
  const r=await requestERP(path,authorization);
  if([401,403].includes(r.status))return null;
  if(!r.ok)throw Error('ERP unavailable');
  return r.json();
}

function isFinance(profile){
  const type=norm(profile?.tipo);
  return type==='administrador'||(!type.startsWith('diretor')&&(type==='financeiro'||norm(profile?.setor)==='financeiro'));
}

/* access: 'ativo' (qualquer usuário ativo) | 'financeiro' (ADM ou setor Financeiro) | 'admin' */
async function requireProfile(req,res,access='ativo',{agent=false}={}){
  const fail=(status,error,details)=>{res.status(status).json(agent?{erro:details,codigo:error}:{ok:false,error,details});return null};
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

module.exports={requireProfile,isFinance,requestERP,erpUrl};
