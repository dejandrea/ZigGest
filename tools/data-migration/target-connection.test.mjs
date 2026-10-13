import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetClient, transactionBody } from './target-connection.mjs';

test('requires the URL and database connection to match the explicit target', () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldDb = process.env.SUPABASE_DB_URL;
  const target = 'abcdefghijklmnopqrst';
  try {
    process.env.SUPABASE_URL = `https://${target}.supabase.co`;
    process.env.SUPABASE_DB_URL = `postgresql://postgres.${target}:fixture@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
    assert.ok(targetClient(target));
    assert.throws(() => targetClient('tsrqponmlkjihgfedcba'));
    process.env.SUPABASE_DB_URL = 'postgresql://postgres:fixture@unrelated.example.invalid/postgres';
    assert.throws(() => targetClient(target));
    process.env.SUPABASE_DB_URL = `postgresql://postgres:fixture@db.${target}.supabase.co:5432/postgres`;
    assert.ok(targetClient(target));
    assert.throws(() => targetClient());
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldDb === undefined) delete process.env.SUPABASE_DB_URL; else process.env.SUPABASE_DB_URL = oldDb;
  }
});

test('strips only transaction boundaries and preserves PL/pgSQL bodies', () => {
  const functionBody = 'create function example() returns void language plpgsql as $$\nbegin\n null;\nend;\n$$;';
  assert.equal(transactionBody(`begin;\n${functionBody}\ncommit;\n`), `${functionBody}\n`);
  assert.equal(transactionBody(functionBody), functionBody);
  assert.equal(transactionBody(`\uFEFFbegin;\r\n${functionBody}\r\ncommit;`), `${functionBody}\r\n`);
});
