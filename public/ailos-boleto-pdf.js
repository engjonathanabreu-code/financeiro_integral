(function(root){
'use strict';
async function gerar(r,{carne=false}={}){
 const C=root.AilosCNAB,c=r.config,hom=c.ambiente==='homologacao';
 C.config(c);if(!hom&&r.boletos.some(b=>r.estados?.[b.id]!=='Registrado'))throw Error('O PDF de cobrança só é liberado após retorno de registro aceito pelo banco. Selecione uma remessa com todos os boletos registrados.');
 const doc=new root.jspdf.jsPDF({unit:'mm',format:'a4'});
 const response=await fetch('ailos-logo.png');if(!response.ok)throw Error('Não foi possível carregar a marca Ailos.');const blob=await response.blob();const logo=await new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=reject;f.readAsDataURL(blob);});
 const br=d=>d.split('-').reverse().join('/'),money=v=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 let offset=0;
 function text(s,x,y,size=9){doc.setFontSize(size);doc.text(String(s),x,y+offset);}
 function field(x,y,w,h,label,value){doc.setDrawColor(80);doc.setLineWidth(.2);doc.rect(x,y+offset,w,h);text(label,x+1.5,y+3,6);const lines=doc.splitTextToSize(String(value),w-3);doc.setFontSize(9);doc.text(lines,x+1.5,y+7+offset);}
 const groups=new Map();for(const b of r.boletos){const key=b.cliente_id||b.pagador.cpf_cnpj;const group=groups.get(key)||[];group.push(b);groups.set(key,group);}
 const ordered=carne?[...groups.values()].flatMap(group=>group.map((b,index)=>({...b,ordem:b.ordem||index+1,total:b.total||group.length,groupIndex:index}))):r.boletos;
 ordered.forEach((b,i)=>{
 if(carne){if(i&&(b.groupIndex===0||b.groupIndex%2===0))doc.addPage();offset=b.groupIndex%2===0?-73:74; text(`${hom?'HOMOLOGACAO - NAO PAGAR | ':''}CARNE - PARCELA ${b.ordem}/${b.total}`,10,81,9);if(b.groupIndex%2===0){doc.setLineDashPattern([1,1],0);doc.line(10,147,200,147);doc.setLineDashPattern([],0);}}else{offset=0;if(i)doc.addPage();}
 const k=C.boleto(c,b),p=b.pagador,linha=k.linha_digitavel;const formatted=`${linha.slice(0,5)}.${linha.slice(5,10)} ${linha.slice(10,15)}.${linha.slice(15,21)} ${linha.slice(21,26)}.${linha.slice(26,32)} ${linha[32]} ${linha.slice(33)}`;
 if(!carne){text(hom?'HOMOLOGACAO - SEM VALOR PARA PAGAMENTO':'BOLETO DE COBRANCA',10,15,12);
 doc.addImage(logo,'PNG',10,22,28,9);text('085-0',42,29,13);text('RECIBO DO PAGADOR',130,29,11);
 field(10,34,130,12,'Beneficiario / CPF-CNPJ',c.nome+' / '+c.cpf_cnpj);field(140,34,60,12,'Agencia / Conta',`${c.agencia}-${c.agencia_dv} / ${c.conta}-${c.conta_dv}`);
 field(10,46,75,12,'Numero do documento',b.documento);field(85,46,55,12,'Vencimento',br(b.vencimento));field(140,46,60,12,'Valor do documento (R$)',money(b.valor));
 field(10,58,130,12,'Pagador / CPF-CNPJ',p.nome+' / '+p.cpf_cnpj);field(140,58,60,12,'Nosso numero',b.nosso_numero);
 text('Autenticacao mecanica',158,75,7);doc.setLineDashPattern([1,1],0);doc.line(10,81,200,81);doc.setLineDashPattern([],0);
 }
 // Ficha com 190 mm de largura e 104 mm de altura, conforme manual.
 doc.addImage(logo,'PNG',10,87+offset,25,8);text('085-0',39,93,12);text(formatted,58,93,9.5);
 field(10,98,140,10,'Local de pagamento','Pagar preferencialmente nas cooperativas do Sistema Ailos.');field(150,98,50,10,'Vencimento',br(b.vencimento));
 field(10,108,140,15,'Beneficiario / CPF-CNPJ / Endereco',`${c.nome} / ${c.cpf_cnpj}\n${c.endereco}`);field(150,108,50,15,'Agencia / Codigo do beneficiario',`${c.agencia}-${c.agencia_dv}\n${c.conta}-${c.conta_dv}`);
 field(10,123,32,10,'Data documento',br(r.data));field(42,123,45,10,'Numero documento',b.documento);field(87,123,20,10,'Especie','DS');field(107,123,12,10,'Aceite','N');field(119,123,31,10,'Processamento',br(r.data));field(150,123,50,10,'Nosso numero',b.nosso_numero);
 field(10,133,35,10,'Uso do banco','');field(45,133,25,10,'Carteira','01');field(70,133,25,10,'Moeda','R$');field(95,133,25,10,'Quantidade','');field(120,133,30,10,'Valor moeda','');field(150,133,50,10,'(=) Valor documento',money(b.valor));
 field(10,143,140,30,'Instrucoes','Sem juros futuros, multa futura, desconto ou protesto.\nNao cobrar taxa de emissao do pagador.');
 field(150,143,50,10,'(-) Descontos / Abatimentos','');field(150,153,50,10,'(+) Mora / Multa / Outros','');field(150,163,50,10,'(=) Valor cobrado','');
 field(10,173,190,18,'Pagador',`${p.nome} / ${p.cpf_cnpj}\n${p.endereco} - ${p.bairro}\n${p.cep} - ${p.cidade}/${p.uf}`);
 text('Autenticacao mecanica - FICHA DE COMPENSACAO',125,196,7);
 const widths=C.bars(k.codigo_barras),unit=103/widths.reduce((a,v)=>a+v,0);let x=10;doc.setFillColor(0);widths.forEach((w,j)=>{if(j%2===0)doc.rect(x,200+offset,w*unit,13,'F');x+=w*unit;});
 if(hom){doc.setTextColor(160);text('HOMOLOGACAO - NAO PAGAR',120,207,10);doc.setTextColor(0);}
 });return doc;
}
root.AilosBoletoPDF={gerar};
})(globalThis);
