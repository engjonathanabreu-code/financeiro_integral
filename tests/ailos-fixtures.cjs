const C=require('../public/ailos-cnab');
const config={ambiente:'homologacao',cpf_cnpj:'11222333000181',nome:'EMPRESA TESTE',endereco:'RUA TESTE 100 CENTRO SC',cooperativa:'COOPERATIVA TESTE',convenio:'010001',agencia:'0101',agencia_dv:'5',conta:'0220665',conta_dv:'8',carteira:'01',homologado:false,protocolo:''};
const pagador={cpf_cnpj:'52998224725',nome:'PAGADOR TESTE',endereco:'RUA TESTE 10',bairro:'CENTRO',cep:'89010000',cidade:'BLUMENAU',uf:'SC'};
const b={id:'00000000-0000-4000-8000-000000000004',nosso_numero:'02206658000000254',documento:'INT000000254',vencimento:'2026-10-10',valor:100,pagador};
const rem={id:'00000000-0000-4000-8000-000000000005',config,sequencia:1,data:'2026-09-29',boletos:[b]};
const set=(s,a,z,v)=>s.slice(0,a-1)+String(v).padEnd(z-a+1,' ')+s.slice(z);
function retorno(r=rem,occ='06',paid=10000){const orig=C.remessa(r).arquivo.trimEnd().split('\r\n'),c=r.config,b=r.boletos[0];let header=set(orig[0],143,143,'2'),hl=set(orig[1],9,9,'T');let t=' '.repeat(240),u=' '.repeat(240);const put=(s,a,z,v,n=false)=>set(s,a,z,n?C.num(v,z-a+1):v);
 for(const [a,z,v,n] of [[1,3,'085',true],[4,7,1,true],[8,8,3,true],[9,13,1,true],[14,14,'T'],[16,17,occ],[18,22,c.agencia,true],[23,23,c.agencia_dv],[24,35,c.conta,true],[36,36,c.conta_dv],[38,57,b.nosso_numero],[58,58,1,true],[59,73,b.documento],[74,81,b.vencimento.split('-').reverse().join('')],[82,96,C.cents(b.valor),true],[134,148,b.pagador.cpf_cnpj,true],[214,223,'0000000000']])t=put(t,a,z,v,n);
 for(const [a,z,v,n] of [[1,3,'085',true],[4,7,1,true],[8,8,3,true],[9,13,2,true],[14,14,'U'],[16,17,occ],[78,92,paid,true],[93,107,paid-200,true],[138,145,'29092026'],[146,153,'30092026']])u=put(u,a,z,v,n);
 let trailer=orig.at(-1).padEnd(240,' ');return [header,hl,t,u,orig.at(-2),trailer].join('\r\n')+'\r\n';}
module.exports={config,pagador,b,rem,retorno,set};
