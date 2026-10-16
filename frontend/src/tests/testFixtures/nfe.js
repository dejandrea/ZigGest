export function makeKey(number=1){
 const base='2926011234567800019555001'+String(number).padStart(9,'0')+'1'+'00000001';
 let sum=0;for(let i=0;i<43;i++)sum+=Number(base[42-i])*(2+i%8);
 const rest=sum%11;return base+(rest<2?0:11-rest);
}
export function nfeXml({number=1,items=1,quantity='2.0000',status='100',environment='1'}={}){
 const key=makeKey(number);
 return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${key}" versao="4.00"><ide><mod>55</mod><tpAmb>${environment}</tpAmb><nNF>${number}</nNF><serie>1</serie><dhEmi>2026-01-01T10:30:00-03:00</dhEmi></ide><emit><CNPJ>12345678000195</CNPJ><xNome>Fornecedor &amp; Bebidas</xNome></emit><dest><CNPJ>98765432000100</CNPJ><xNome>Cliente teste</xNome></dest>${Array.from({length:items},(_,i)=>`<det nItem="${i+1}"><prod><cProd>COLA-${i+1}</cProd><xProd>Coca-Cola pacote ${i+1}</xProd><cEAN>7890000000000</cEAN><NCM>22021000</NCM><CFOP>5102</CFOP><uCom>PCT</uCom><qCom>${quantity}</qCom><vUnCom>48.00</vUnCom><vProd>96.00</vProd><uTrib>UN</uTrib><qTrib>24.0000</qTrib></prod><imposto><vTotTrib>1.23</vTotTrib></imposto></det>`).join('')}<total><ICMSTot><vNF>${items*96}.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><tpAmb>${environment}</tpAmb><chNFe>${key}</chNFe><cStat>${status}</cStat></infProt></protNFe></nfeProc>`;
}
