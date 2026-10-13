import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { BSON } from 'mongodb';
import Decimal from 'decimal.js';
import { customer, ledger, user } from './transform.mjs';

export async function loadImportSource() {
  const root = resolve(import.meta.dirname, '../../.migration-private');
  const folder = (await readFile(resolve(root, 'latest-export'), 'utf8')).trim();
  const inside = relative(root, folder);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Snapshot must stay in private export directory');
  const manifest = JSON.parse(await readFile(resolve(folder, 'manifest.json'), 'utf8'));
  if (!manifest.snapshot || manifest.database !== 'NinjaDistribuidora') throw new Error('Unexpected source database');
  const docs = {};
  for (const entry of manifest.collections) {
    if (!['clientes','contas','counters','mesas','itemmesas','usuarios'].includes(entry.name)) {
      throw new Error('Unmapped source collection requires review');
    }
    if(entry.filename !== encodeURIComponent(entry.name)+'.ejson') throw new Error('Unexpected snapshot collection filename');
    const text = await readFile(resolve(folder, entry.filename), 'utf8');
    if (createHash('sha256').update(text).digest('hex') !== entry.sha256) throw new Error('Snapshot checksum mismatch');
    docs[entry.name] = BSON.EJSON.parse(text);
    if (docs[entry.name].length !== entry.count) throw new Error('Snapshot count mismatch');
  }
  if ((docs.mesas?.length ?? 0) || (docs.itemmesas?.length ?? 0)) throw new Error('Open tables require dedicated migration');
  let roundedBalances = 0;
  const customers = (docs.clientes ?? []).map(doc => {
    const row = customer(doc);
    const rounded = new Decimal(row.total_pendente).toDecimalPlaces(6);
    if (!rounded.eq(row.total_pendente)) roundedBalances++;
    return { ...row, total_pendente: rounded.toString() };
  });
  const entries = (docs.contas ?? []).map(ledger);
  if (entries.some(row => !new Decimal(row.amount).eq(new Decimal(row.amount).toDecimalPlaces(6)))) {
    throw new Error('Entry amount exceeds target precision; review required');
  }
  const users = (docs.usuarios ?? []).map(user);
  const codes = new Set(customers.map(row => row.codigo_cliente));
  if (codes.size !== customers.length || new Set(entries.map(row => row.codigo_conta)).size !== entries.length ||
      new Set(entries.map(row => row.mongo_oid)).size !== entries.length || entries.some(row => !codes.has(row.customer_codigo))) {
    throw new Error('Duplicate business codes or orphan ledger entries');
  }
  const sums = new Map(customers.map(row => [row.codigo_cliente,new Decimal(0)]));
  let debit = new Decimal(0), credit = new Decimal(0);
  for (const row of entries) {
    const amount = new Decimal(row.amount);
    if (row.entry_type === 'DEBIT') debit = debit.plus(amount); else credit = credit.plus(amount);
    sums.set(row.customer_codigo, sums.get(row.customer_codigo).plus(row.entry_type === 'DEBIT' ? amount : amount.negated()));
  }
  const balanceDifferences = customers.filter(row => !sums.get(row.codigo_cliente).eq(row.total_pendente));
  const customerLinks = (docs.clientes ?? []).map(doc=>({codigo_cliente:Number(doc.codigoCliente),mongo_oid:String(doc._id),source_cached_balance:new Decimal(String(doc.totalPendente??0)).toString()}));
  // The legacy API computes balances from entries, not its unused cached field.
  // Preserve that field privately and initialize V2's cache from the full ledger.
  const customersWithBalances = customers.map(row=>({...row,total_pendente:sums.get(row.codigo_cliente).toString()}));
  const counterValues = {};
  for (const counter of docs.counters ?? []) {
    const name = counter.id;
    if (!['codigoCliente','codigoConta'].includes(name)) throw new Error('Unknown source business counter');
    const value = Number(counter.seq);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid source counter');
    counterValues[name] = Math.max(counterValues[name] ?? 0, value);
  }
  return { folder, manifest, customers:customersWithBalances, customerLinks, entries, users, counterValues, summary: {
    database:manifest.database, customers:customers.length, entries:entries.length, users:users.length,
    debit:debit.toString(), credit:credit.toString(), balance:debit.minus(credit).toString(),
    normalizedCachedBalances:roundedBalances, cachedBalanceDifferences:balanceDifferences.length,
    customerSequence:Math.max(counterValues.codigoCliente ?? 0,...customers.map(row=>row.codigo_cliente)),
    ledgerSequence:Math.max(counterValues.codigoConta ?? 0,...entries.map(row=>row.codigo_conta)),
  } };
}
