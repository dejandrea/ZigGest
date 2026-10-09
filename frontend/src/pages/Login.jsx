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
  return <main className="login-page">
    <aside className="login-brand" aria-label="Sobre o ZigGest">
      <div className="login-wordmark"><span className="login-mark" aria-hidden="true">Z</span>ZigGest</div>
      <div className="login-brand-copy">
        <p className="login-eyebrow">Gestão que acompanha você</p>
        <h1>Mais controle.<br/>Mais clareza.<br/>Todos os dias.</h1>
        <p>Organize seus clientes, acompanhe os lançamentos e mantenha sua operação em dia.</p>
        <div className="login-capabilities"><span>Clientes</span><span>Lançamentos</span><span>Operação</span></div>
      </div>
      <p className="login-brand-footer">ZigGest · Sistema de gestão<br/>Tudo conectado à sua rotina.</p>
    </aside>
    <section className="login-form-side" aria-labelledby="login-title">
      <div className="login-panel">
        <div className="login-wordmark login-mobile-brand"><span className="login-mark" aria-hidden="true">Z</span>ZigGest</div>
        <p className="login-kicker">{mode==='login'?'Bem-vindo de volta':'Sua conta ZigGest'}</p>
        <h2 id="login-title">{mode==='login'?'Entrar':mode==='signup'?'Primeiro acesso':'Recuperar senha'}</h2>
        <p className="login-intro">{mode==='signup'?'Use o e-mail autorizado pelo administrador e escolha uma senha para sua conta.':mode==='reset'?'Informe seu e-mail para receber as instruções de recuperação.':'Acesse sua conta para acompanhar o seu negócio.'}</p>
        {configurationError&&<p className="login-notice" role="alert">{configurationError}</p>}
        {session&&!profile&&<p className="login-notice" role="alert">Sem autorização para acessar o sistema. <button className="login-text-button" onClick={()=>signOut().catch(cause=>setError(cause.message))}>Sair</button></p>}
        <form onSubmit={submit} aria-busy={busy}>
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" type="email" autoComplete="username" placeholder="voce@empresa.com" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy} required />
          {mode!=='reset'&&<>
            <div className="login-password-label"><label htmlFor="login-password">Senha</label>{mode==='login'&&<button className="login-text-button" type="button" disabled={busy} onClick={()=>changeMode('reset')}>Esqueci minha senha</button>}</div>
            <input id="login-password" type="password" autoComplete={mode==='signup'?'new-password':'current-password'} placeholder={mode==='signup'?'Pelo menos 8 caracteres':'Sua senha'} minLength={mode==='signup'?8:undefined} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} required />
          </>}
          <button className="login-submit" disabled={busy||!!configurationError}>{busy?'Aguarde…':mode==='login'?'Entrar':mode==='signup'?'Confirmar primeiro acesso':'Enviar instruções'}<span aria-hidden="true">→</span></button>
        </form>
        {error&&<p className="login-notice" role="alert">{error}</p>}{message&&<p className="login-notice" role="status">{message}</p>}
        <nav className="login-access-nav" aria-label="Acesso">
          <button type="button" disabled={busy} aria-current={mode==='login'?'page':undefined} onClick={()=>changeMode('login')}>Login</button>
          <button type="button" disabled={busy} aria-current={mode==='signup'?'page':undefined} onClick={()=>changeMode('signup')}>Primeiro acesso</button>
        </nav>
        <p className="login-footnote">Seu acesso é individual.<br/>Use o e-mail autorizado para sua conta.</p>
      </div>
    </section>
  </main>;
}
