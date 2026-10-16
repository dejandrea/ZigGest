import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {targetClient,transactionBody,reportFailure} from './target-connection.mjs';
const file='20261016035748_operation_logs_report.sql';
const [expectedRef]=process.argv.slice(2);
let client,stage='connect';
try{
 client=targetClient(expectedRef);await client.connect();await client.query('begin');
 await client.query("set local lock_timeout='5s'; set local statement_timeout='90s'");
 const {rows:[installation]}=await client.query('select project_ref,migrations from app_private.installation_manifest for update');
 if(installation?.project_ref!==expectedRef)throw new Error('Installation target mismatch');
 const version=file.slice(0,14),name=file.slice(15,-4);
 const {rows:history}=await client.query('select version from supabase_migrations.schema_migrations where version >= $1',[version]);
 if(history.length)throw new Error('Migration already applied or out of order');
 stage='apply-report';const source=await readFile(resolve(import.meta.dirname,'../../supabase/migrations',file),'utf8');
 const sql=transactionBody(source);await client.query(sql);
 await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)',[version,[sql],name]);
 const manifest=[...installation.migrations,{file,sha256:createHash('sha256').update(source).digest('hex')}];
 await client.query('update app_private.installation_manifest set migrations=$1 where singleton',[JSON.stringify(manifest)]);
 await client.query('commit');console.log(JSON.stringify({ok:true,target:expectedRef,applied:file}));
}catch(error){await client?.query('rollback').catch(()=>{});reportFailure(stage,error);}finally{await client?.end();}
