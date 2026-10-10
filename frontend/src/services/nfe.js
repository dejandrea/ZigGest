const NS='http://www.portalfiscal.inf.br/nfe';
export const MAX_NFE_BYTES=2*1024*1024;
export const NFE_PORTAL='https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx';
export function normalizeInvoiceKey(value){return String(value??'').replace(/\s/g,'');}
export function validInvoiceKey(value){
 const key=normalizeInvoiceKey(value);if(!/^\d{44}$/.test(key)||key.slice(20,22)!=='55')return false;
 let sum=0,weight=2;for(let i=42;i>=0;i--){sum+=Number(key[i])*weight;weight=weight===9?2:weight+1;}
 const remainder=sum%11;return Number(key[43])===(remainder<2?0:11-remainder);
}
function child(node,name){return Array.from(node?.children??[]).find(e=>e.localName===name&&e.namespaceURI===NS);}
function text(node,path){return path.split('/').reduce((n,key)=>child(n,key),node)?.textContent?.trim()??'';}
function decimal(value,label){if(!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw new Error(label+' inválido no XML.');return value;}
export function parseNfe(xml){
 if(typeof xml!=='string'||new TextEncoder().encode(xml).length>MAX_NFE_BYTES)throw new Error('O XML deve ter até 2 MB.');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XML com declaração de entidades não é aceito.');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)throw new Error('Arquivo XML inválido.');
 const root=doc.documentElement,nfe=child(root,'NFe'),info=child(nfe,'infNFe'),protocol=child(child(root,'protNFe'),'infProt');
 if(root.localName!=='nfeProc'||root.namespaceURI!==NS||!info||!protocol)throw new Error('Importe o XML completo da NF-e com protocolo de autorização (nfeProc).');
 const key=info.getAttribute('Id')?.replace(/^NFe/,'');
 if(!validInvoiceKey(key)||text(protocol,'chNFe')!==key||text(info,'ide/mod')!=='55')throw new Error('Chave ou modelo da NF-e inválido.');
 if(text(info,'ide/tpAmb')!=='1'||text(protocol,'tpAmb')!=='1')throw new Error('Notas de homologação não podem movimentar estoque.');
 if(!['100','150'].includes(text(protocol,'cStat')))throw new Error('NF-e sem protocolo de autorização aprovado.');
 const issuedAt=text(info,'ide/dhEmi')||text(info,'ide/dEmi');
 if(!Number.isFinite(new Date(issuedAt).getTime()))throw new Error('Data de emissão inválida no XML.');
 const items=Array.from(info.children).filter(e=>e.localName==='det'&&e.namespaceURI===NS).map(det=>{
  const prod=child(det,'prod'),line=Number(det.getAttribute('nItem'));
  const name=text(prod,'xProd'),quantity=decimal(text(prod,'qCom'),'Quantidade'),unit=text(prod,'uCom');
  if(!Number.isInteger(line)||line<1||!name||!unit||Number(quantity)<=0)throw new Error('Item inválido no XML.');
  return {line,code:text(prod,'cProd'),name,unit,quantity,unitPrice:decimal(text(prod,'vUnCom'),'Preço'),total:decimal(text(prod,'vProd'),'Valor do item'),ean:text(prod,'cEAN'),ncm:text(prod,'NCM'),cfop:text(prod,'CFOP'),taxUnit:text(prod,'uTrib'),taxQuantity:text(prod,'qTrib')};
 });
 if(!items.length||items.length>990||new Set(items.map(i=>i.line)).size!==items.length)throw new Error('A NF-e deve conter entre 1 e 990 itens distintos.');
 return {key,number:text(info,'ide/nNF'),series:text(info,'ide/serie'),issuedAt,issuerName:text(info,'emit/xNome'),issuerDocument:text(info,'emit/CNPJ')||text(info,'emit/CPF'),recipientName:text(info,'dest/xNome'),recipientDocument:text(info,'dest/CNPJ')||text(info,'dest/CPF'),total:decimal(text(info,'total/ICMSTot/vNF'),'Total da nota'),items};
}
export async function readNfeFile(file){
 if(!file||file.size>MAX_NFE_BYTES)throw new Error('Selecione um XML de até 2 MB.');
 const bytes=await file.arrayBuffer();
 const declaration=new TextDecoder('ascii').decode(bytes.slice(0,200));
 const encoding=declaration.match(/encoding\s*=\s*["']([^"']+)/i)?.[1]??'utf-8';
 let xml;try{xml=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw new Error('Não foi possível ler a codificação do XML.');}
 return {xml,invoice:parseNfe(xml)};
}
export function localDateTime(value){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
