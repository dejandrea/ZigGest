import React,{useState} from 'react';
import { Navigate,useLocation } from 'react-router-dom';
import { supabase,configurationError } from '../services/supabase';
import { useAuth } from '../auth/AuthContext';
import '../styles/pages/Access.css';
import { authErrorMessage } from '../services/authErrors';

export default function Login() {
  const { session,profile,loading,recovery,signOut }=useAuth();
  const location=useLocation();
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  if (!loading && recovery) return <Navigate to="/alterar-senha" replace />;
  if (!loading && session && profile) {
    const destination=location.state?.from;
    return <Navigate to={destination?.startsWith('/')&&!destination.startsWith('//')?destination:'/'} replace />;
  }
  function changeMode(next) { setMode(next);setError('');setMessage('');setPassword(''); }
  async function submit(event) {
    event.preventDefault();setError('');setMessage('');setBusy(true);
    try {
      if (!supabase) throw new Error(configurationError);
      let response;
      if (mode==='login') response=await supabase.auth.signInWithPassword({email:email.trim(),password});
      else if (mode==='signup') response=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+'/login'}});
      else response=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+'/alterar-senha'});
      if (response.error) {
        throw new Error(authErrorMessage(response.error, mode));
      }
      setPassword('');
      if (mode==='signup') setMessage('Confira seu e-mail para confirmar o primeiro acesso. Depois entre com a nova senha.');
      if (mode==='reset') setMessage('Se houver uma conta para esse e-mail, você receberá as instruções.');
    } catch(cause) {setError(cause.message);} finally {setBusy(false);}
  }
  return <main className='access-page'><section className='access-card'><h1>ZigGest</h1><h2>{mode==='login'?'Entrar':mode==='signup'?'Primeiro acesso':'Recuperar senha'}</h2>
{configurationError&&<p role='alert'>{configurationError}</p>}
<form onSubmit={submit}><label htmlFor='email'>E-mail</label><input id='email' type='email' value={email} onChange={e=>setEmail(e.target.value)} required/>{mode!=='reset'&&<><label htmlFor='password'>Senha</label><input id='password' type='password' minLength={mode==='signup'?8:undefined} value={password} onChange={e=>setPassword(e.target.value)} required/></>}<button disabled={busy||!!configurationError}>{busy?'Aguarde':mode==='login'?'Entrar':mode==='signup'?'Confirmar primeiro acesso':'Enviar instrucoes'}</button></form>{error&&<p role='alert'>{error}</p>}{message&&<p role='status'>{message}</p>}
<nav><button onClick={()=>changeMode('login')}>Login</button><button onClick={()=>changeMode('signup')}>Primeiro acesso</button><button onClick={()=>changeMode('reset')}>Esqueci minha senha</button></nav></section></main>;
}
