export function normalizeCnpj(value){return String(value??'').replace(/[.\/\-\s]/g,'');}
export function validCnpj(value){
 const cnpj=normalizeCnpj(value);if(!/^\d{14}$/.test(cnpj)||/^(\d)\1{13}$/.test(cnpj))return false;
 for(const size of [12,13]){
  let sum=0,weight=size-7;for(let i=0;i<size;i++){sum+=Number(cnpj[i])*weight;weight=weight===2?9:weight-1;}
  const rest=sum%11;if(Number(cnpj[size])!==(rest<2?0:11-rest))return false;
 }
 return true;
}
const failure='Não foi possível completar os dados pelo CNPJ. Preencha o cadastro manualmente ou tente novamente.';
function text(value,max=500){return typeof value==='string'?value.trim().slice(0,max):'';}
export async function lookupSupplier(value,{signal}={}){
 const cnpj=normalizeCnpj(value);if(!validCnpj(cnpj))throw new Error('CNPJ inválido para consulta. Confira o documento ou preencha manualmente.');
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,8000);
 try{
  const response=await fetch('https://brasilapi.com.br/api/cnpj/v1/'+cnpj,{signal:controller.signal,credentials:'omit',headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(failure);
  const data=await response.json();
  if(normalizeCnpj(data?.cnpj)!==cnpj||!text(data?.razao_social,200))throw new Error(failure);
  const email=text(data.email);
  return {nome:text(data.razao_social,200),nomeFantasia:text(data.nome_fantasia),telefone:text(data.ddd_telefone_1)||text(data.ddd_telefone_2),email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'',endereco:[text(data.descricao_tipo_de_logradouro),text(data.logradouro)].filter(Boolean).join(' ')+[text(data.numero),text(data.complemento),text(data.bairro),[text(data.municipio),text(data.uf)].filter(Boolean).join(' / '),text(data.cep)?'CEP '+text(data.cep):''].filter(Boolean).map(v=>', '+v).join('')};
 }catch{throw new Error(failure);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
