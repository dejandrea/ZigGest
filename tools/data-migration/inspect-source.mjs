import { MongoClient, BSON } from 'mongodb';
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

config({ path: resolve(import.meta.dirname, '../../backend/.env'), quiet: true });
const client = new MongoClient(process.env.MONGODB_URI, {
  appName: 'AppNinja-read-only-export',
  serverSelectionTimeoutMS: 15000,
  readConcern: { level: 'majority' },
});
let session;
try {
  await client.connect();
  const db = client.db();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const folder = resolve(import.meta.dirname, '../../.migration-private', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(folder, { recursive: true });
  session = client.startSession({ snapshot: true });
  const summary = { database: db.databaseName, snapshot: true, collections: [], exportDirectory: folder };
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const docs = await db.collection(name).find({}, { session }).sort({ _id: 1 }).toArray();
    const text = BSON.EJSON.stringify(docs, { relaxed: false });
    const filename = encodeURIComponent(name) + '.ejson';
    await writeFile(resolve(folder, filename), text, { mode: 0o600 });
    summary.collections.push({ name, count: docs.length, filename, sha256: createHash('sha256').update(text).digest('hex'), fields: [...new Set(docs.flatMap(Object.keys))].sort() });
  }
  await writeFile(resolve(folder, 'manifest.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  await writeFile(resolve(import.meta.dirname, '../../.migration-private/latest-export'), folder, { mode: 0o600 });
  console.log(JSON.stringify({ database: summary.database, snapshot: summary.snapshot, collections: summary.collections.map(({ name, count, fields }) => ({ name, count, fields })), privateExportCreated: true }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: 'Read-only MongoDB export failed. No credentials or documents logged.', type: error.name, code: error.code ?? null }));
  process.exitCode = 1;
} finally {
  if (session) await session.endSession();
  await client.close();
}
