/* Integral Financeiro - uma única conexão Supabase por página.
   Vários módulos chamam supabase.createClient com a mesma URL e chave. Cada cliente renovava o
   token por conta própria, o que gera "Multiple GoTrueClient" e pode derrubar a sessão quando
   duas renovações usam o mesmo refresh token. Aqui o primeiro cliente criado é reaproveitado. */
(function(){
'use strict';
const lib=window.supabase;
if(!lib||typeof lib.createClient!=='function'||lib.createClient.__integralShared)return;
const original=lib.createClient.bind(lib);
const clients=new Map();
const shared=function(url,key,options){
  const id=`${url}|${key}`;
  if(!clients.has(id))clients.set(id,original(url,key,Object.assign({auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}},options||{})));
  return clients.get(id);
};
shared.__integralShared=true;
lib.createClient=shared;
})();
