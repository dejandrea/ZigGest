import {describe,expect,it} from 'vitest';
import {customerToRow,ledgerToRow,ledgerFromRow} from './dataMapping';
import {isPublicSupabaseKey} from './publicConfiguration';
describe('Supabase mapping',()=>{
  it('normalizes form booleans and ignores immutable and computed fields',()=>{
    expect(customerToRow({nome:'Fixture',ativo:'false',limite:'100',codigoCliente:999,totalPendente:999,role:'ADMIN'})).toEqual({nome:'Fixture',ativo:false,limite:100});
  });
  it('preserves notes and uses a date-safe Bahia due timestamp',()=>{
    expect(ledgerToRow({codigoCliente:2,tipo:'credito',valor:12.34,observacoes:'Fixture note',dataVencimento:'2026-10-10'})).toEqual({customer_codigo:2,entry_type:'CREDIT',amount:12.34,notes:'Fixture note',due_at:'2026-10-10T12:00:00-03:00'});
  });
  it('rejects invalid financial values and entry types',()=>{
    expect(()=>ledgerToRow({valor:-1})).toThrow();expect(()=>ledgerToRow({tipo:'other'})).toThrow();expect(()=>customerToRow({limite:'invalid'})).toThrow();
  });
  it('returns the old UI field names without discarding notes',()=>{
    const row=ledgerFromRow({id:'fixture',codigo_conta:2,customer_codigo:3,amount:'12.34',entry_type:'DEBIT',notes:'Fixture note'},[{codigo_cliente:3,nome:'Fixture'}]);
    expect(row.valor).toBe(12.34);expect(row.clienteNome).toBe('Fixture');expect(row.observacoes).toBe('Fixture note');
  });
  it('rejects privileged keys in browser configuration',()=>{
    const jwt=role=>'header.'+btoa(JSON.stringify({role}))+'.fictitious-signature';
    expect(isPublicSupabaseKey(jwt('anon'))).toBe(true);
    expect(isPublicSupabaseKey(jwt('service_role'))).toBe(false);
    expect(isPublicSupabaseKey('sb_secret_fictitious')).toBe(false);
    expect(isPublicSupabaseKey('sb_publishable_fictitious')).toBe(true);
  });
});
