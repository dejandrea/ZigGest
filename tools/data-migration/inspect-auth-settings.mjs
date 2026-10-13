import { config } from 'dotenv';
import { resolve } from 'node:path';
config({path:resolve(import.meta.dirname,'../../backend/.env'),quiet:true});
try {
  const response=await fetch(process.env.SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY??process.env.SUPABASE_ANON_KEY}});
  if(!response.ok) throw new Error('settings unavailable');
  const settings=await response.json();
  console.log(JSON.stringify({emailEnabled:settings.external?.email,emailAutoConfirm:settings.mailer_autoconfirm,signupsDisabled:settings.disable_signup}));
}catch {console.error('Unable to inspect public Auth settings.');process.exitCode=1;}
