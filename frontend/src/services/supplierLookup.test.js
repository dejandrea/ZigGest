import {it,expect,vi,afterEach} from 'vitest';
import {lookupSupplier,validCnpj} from './supplierLookup';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('validates check digits and maps public company data',async()=>{
 expect(validCnpj('19.131.243/0001-97')).toBe(true);
 expect(validCnpj('19131243000190')).toBe(false);
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({cnpj:'19131243000197',razao_social:'Empresa',nome_fantasia:'Marca',ddd_telefone_1:'7133334444',email:null,logradouro:'Rua A',numero:'10',municipio:'Salvador',uf:'BA',cep:'40000000'})});
 vi.stubGlobal('fetch',fetch);
 expect(await lookupSupplier('19.131.243/0001-97')).toMatchObject({nome:'Empresa',nomeFantasia:'Marca',telefone:'7133334444',email:'',endereco:'Rua A, 10, Salvador / BA, CEP 40000000'});
 expect(fetch).toHaveBeenCalledWith('https://brasilapi.com.br/api/cnpj/v1/19131243000197',expect.objectContaining({credentials:'omit'}));
});
it('reports unavailable and mismatched responses for manual fallback',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,json:async()=>({cnpj:'00000000000000',razao_social:'Wrong'})}));
 await expect(lookupSupplier('19131243000197')).rejects.toThrow('manualmente');
 await expect(lookupSupplier('19131243000197')).rejects.toThrow('manualmente');
});
it('times out instead of keeping the form waiting indefinitely',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort'))))));
 const result=expect(lookupSupplier('19131243000197')).rejects.toThrow('manualmente');
 await vi.advanceTimersByTimeAsync(8000);await result;
});
