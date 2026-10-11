import {it,expect} from 'vitest';
import {formatDocument,formatPhone} from './contactMasks';
it('formats CPF and CNPJ consistently with or without punctuation and keeps leading zeroes',()=>{
 expect(formatDocument('07196033002303')).toBe('07.196.033/0023-03');
 expect(formatDocument('60.859.678/0001-56')).toBe('60.859.678/0001-56');
 expect(formatDocument('01234567890')).toBe('012.345.678-90');
 expect(formatDocument('')).toBe('');
});
it('formats landlines, mobiles, partial input and the Brazilian country code',()=>{
 expect(formatPhone('7133334444')).toBe('(71) 3333-4444');
 expect(formatPhone('71999998888')).toBe('(71) 99999-8888');
 expect(formatPhone('(71) 99999-8888')).toBe('(71) 99999-8888');
 expect(formatPhone('+55 71 99999-8888')).toBe('+55 (71) 99999-8888');
 expect(formatPhone('713')).toBe('(71) 3');
 expect(formatPhone(null)).toBe('');
});
