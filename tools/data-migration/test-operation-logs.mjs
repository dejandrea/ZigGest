import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {targetClient,reportFailure} from './target-connection.mjs';
let client;
try{
 client=targetClient(process.argv[2]);await client.connect();
 await client.query(await readFile(resolve(import.meta.dirname,'../../supabase/tests/operation_logs_report.sql'),'utf8'));
 console.log(JSON.stringify({ok:true,tests:'audit capture, snapshots, pagination, filters, Bahia dates, redaction, admin access, denied access',rolledBack:true}));
}catch(error){await client?.query('rollback').catch(()=>{});reportFailure('test-operation-logs',error);}finally{await client?.end();}
