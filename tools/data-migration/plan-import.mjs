import { loadImportSource } from './import-source.mjs';
import { reportFailure } from './target-connection.mjs';
try {
  const source = await loadImportSource();
  console.log(JSON.stringify(source.summary));
} catch (error) { reportFailure('validate-snapshot',error); }
