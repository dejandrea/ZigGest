import test from 'node:test';
import assert from 'node:assert/strict';
import { money, date, customer, ledger, differences, user } from './transform.mjs';

test('preserves decimal financial amounts without rounding', () => {
  assert.equal(money('123456.789'), '123456.789');
  assert.deepEqual(differences({ amount: '0.10' }, { amount: 0.1 }), []);
  assert.deepEqual(differences({ amount: '0.10' }, { amount: 0.2 }), ['amount']);
});
test('rejects negative and unknown ledger entries', () => {
  assert.throws(() => ledger({ tipo: 'debito', valor: -1 }));
  assert.throws(() => ledger({ tipo: 'other', valor: 1 }));
});
test('preserves customer business code and defaults', () => {
  const row = customer({ codigoCliente: 7, nome: 'Fictitious customer' });
  assert.equal(row.codigo_cliente, 7);
  assert.equal(row.limite, '100');
  assert.throws(() => customer({ codigoCliente: 1.5 }));
});
test('normalizes valid timestamps and rejects invalid ones', () => {
  assert.equal(date('2026-01-01T03:00:00-03:00'), '2026-01-01T06:00:00.000Z');
  assert.throws(() => date('invalid'));
});
test('does not invent roles or accept plaintext passwords', () => {
  assert.throws(() => user({ senha: 'fictitious-plaintext' }));
  const row = user({ _id: 'fictitious-id', codigoUsuario: 1, senha: '$2b$10$' + 'A'.repeat(53), nome: 'Fictitious', email: 'example@example.invalid' });
  assert.equal(Object.hasOwn(row, 'role'), false);
});
