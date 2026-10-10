import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectUtf8} from './check-encoding.mjs';
test('accepts valid Portuguese UTF-8 without mistaking uppercase accents for corruption',()=>{
 assert.equal(inspectUtf8(Buffer.from('Cartão de crédito · Boleto bancário · ADMINISTRAÇÃO · AÇÃO — Não', 'utf8')),null);
});
test('rejects UTF-8 decoded incorrectly as Windows-1252 and identifies the line',()=>{
 assert.equal(inspectUtf8(Buffer.from('Nome\nCart\u00c3\u00a3o de cr\u00c3\u00a9dito','utf8')),'Corrupted text on line 2');
});
test('rejects legacy single-byte encoding and replacement characters',()=>{
 assert.equal(inspectUtf8(Buffer.from([0xe9])),'Invalid UTF-8 bytes');
 assert.equal(inspectUtf8(Buffer.from('Boleto \ufffd','utf8')),'Corrupted text on line 1');
});
