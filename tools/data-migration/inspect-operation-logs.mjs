import {targetClient,reportFailure} from './target-connection.mjs';
let client;
try {
 client=targetClient(process.argv[2]);await client.connect();
 const {rows}=await client.query(`select entity, count(*)::integer as records from app_private.operation_logs group by entity order by entity`);
 const {rows:coverage}=await client.query(`select t.table_name,exists(select 1 from information_schema.triggers g where g.event_object_schema=t.table_schema and g.event_object_table=t.table_name and g.action_statement like '%audit_operation%') as audited from information_schema.tables t where t.table_schema='public' and t.table_type='BASE TABLE' order by t.table_name`);
 const {rows:installation}=await client.query('select project_ref,jsonb_array_length(migrations) as migration_count from app_private.installation_manifest');
 const {rows:history}=await client.query('select version,name from supabase_migrations.schema_migrations order by version desc limit 5');
 console.log(JSON.stringify({logs:rows,coverage,installation,history}));
}catch(error){reportFailure('inspect-logs',error);}finally{await client?.end();}
