import Decimal from 'decimal.js';

export function integer(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('invalid identifier');
  return number;
}
export function money(value) {
  const decimal = new Decimal(String(value ?? 0));
  if (!decimal.isFinite()) throw new Error('invalid monetary value');
  return decimal.toString();
}
export function date(value) {
  if (value == null) return null;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error('invalid date');
  return result.toISOString();
}
function state(value) {
  if (!['liberado', 'bloqueado'].includes(value)) throw new Error('invalid status');
  return value;
}
export function customer(doc) {
  return {
    codigo_cliente: integer(doc.codigoCliente), nome: doc.nome,
    apelido: doc.apelido ?? null, telefone: doc.telefone ?? null,
    email: doc.email ?? null, endereco: doc.endereco ?? null,
    ativo: doc.ativo ?? true, status: state(doc.status ?? 'liberado'),
    limite: money(doc.limite ?? 100), total_pendente: money(doc.totalPendente),
    observacoes: doc.observacoes ?? null,
    created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
  };
}
export function ledger(doc) {
  if (!['debito', 'credito'].includes(doc.tipo)) throw new Error('invalid entry type');
  const amount = money(doc.valor);
  if (new Decimal(amount).isNegative()) throw new Error('negative ledger amount');
  return {
    mongo_oid: String(doc._id), codigo_conta: integer(doc.codigoConta),
    customer_codigo: integer(doc.codigoCliente),
    entry_type: doc.tipo === 'debito' ? 'DEBIT' : 'CREDIT', amount,
    issue_at: date(doc.dataLancamento), due_at: date(doc.dataVencimento),
    notes: doc.observacoes ?? null,
    created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
  };
}
export function user(doc) {
  if (typeof doc.senha !== 'string' || !/^\$2[aby]\$\d{2}\$/.test(doc.senha)) throw new Error('unsupported password hash');
  return {
    mongo_oid: String(doc._id), codigo_usuario: integer(doc.codigoUsuario),
    nome: doc.nome, email: doc.email, password_hash: doc.senha,
    ativo: doc.ativo ?? true, status: state(doc.status ?? 'liberado'),
    created_at: date(doc.createdAt), updated_at: date(doc.updatedAt),
  };
}
const numeric = new Set(['amount', 'limite', 'total_pendente']);
export function differences(expected, actual) {
  return Object.keys(expected).filter(key => {
    if (numeric.has(key)) return !new Decimal(expected[key]).eq(actual[key] ?? 0);
    if (key.endsWith('_at')) return date(expected[key]) !== date(actual[key]);
    const a = expected[key] === '' ? null : expected[key];
    const b = actual[key] === '' ? null : actual[key];
    return a !== b;
  });
}
