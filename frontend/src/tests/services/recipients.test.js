import {it,expect} from 'vitest';
import {matchInvoiceParty,matchInvoiceName,recipientToRow} from '../../services/recipients';
it('matches masked documents and avoids choosing a CNPJ when branches have the same name',()=>{
 const rows=[{nome:'LOJA',documento:'19.131.243/0001-97',ativo:true},{nome:'LOJA',documento:'41817328000109',ativo:true}];
 expect(matchInvoiceParty(rows,'19131243000197')).toBe(rows[0]);expect(matchInvoiceName(rows,'loja')).toBeUndefined();expect(matchInvoiceParty(rows,'')).toBeUndefined();
});
it('normalizes recipient documents and excludes protected fields',()=>{
 expect(recipientToRow({nome:'Filial',documento:'19.131.243/0001-97',inscricaoEstadual:'00123',recipient_id:'forged',role:'MASTER'})).toEqual({nome:'Filial',documento:'19131243000197',inscricao_estadual:'00123'});
 expect(()=>recipientToRow({documento:'123'})).toThrow('completo');
});
