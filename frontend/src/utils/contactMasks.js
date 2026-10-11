const text=value=>String(value??'');
export const documentCharacters=value=>text(value).replace(/[^a-z\d]/gi,'').toUpperCase();
export const phoneDigits=value=>text(value).replace(/\D/g,'');
function mask(value,pattern){
 let index=0,result='';
 for(const character of pattern){
  if(index>=value.length)break;
  result+=character==='#'?value[index++]:character;
 }
 return result;
}
export function formatDocument(value){
 const raw=documentCharacters(value);
 if(raw.length>14)return text(value);
 return mask(raw,raw.length>11||/[A-Z]/.test(raw)?'##.###.###/####-##':'###.###.###-##');
}
export function formatPhone(value){
 const raw=phoneDigits(value);
 if(!raw)return '';
 const country=raw.startsWith('55')&&(raw.length>11||text(value).startsWith('+55'));
 const local=country?raw.slice(2):raw;
 if(local.length>11)return text(value);
 return (country?'+55 ':'')+mask(local,local.length>10?'(##) #####-####':'(##) ####-####');
}
