import React,{useState} from 'react';
import { Navigate,useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../auth/AuthContext';
import '../styles/pages/Access.css';
export default function ChangePassword() {
  const {session,loading,setRecovery,signOut}=useAuth();
  const navigate=useNavigate();
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  if (loading) return <main className="access-page" role="status">Verificando acesso…</main>;
  if (!session) return <Navigate to="/login" replace />;
  async function submit(event) {
    event.preventDefault();setError('');
    if(password!==confirmation) {setError('As senhas não coincidem.');return;}
    setBusy(true);
    try {
      const {error: updateError}=await supabase.auth.updateUser({password});
      if(updateError) throw new Error('Não foi possível alterar a senha. Solicite outro link se ele expirou.');
      setRecovery(false);await signOut();navigate('/login',{replace:true});
    } catch(cause) {setError(cause.message);} finally {setBusy(false);}
  }
  return <main className="access-page"><section className="access-card"><h1>Definir nova senha</h1><form onSubmit={submit}>
    <label htmlFor="new-password">Nova senha</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required />
    <label htmlFor="confirm-password">Confirmar senha</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={e=>setConfirmation(e.target.value)} required />
    <button disabled={busy}>{busy?'Salvando…':'Salvar senha'}</button></form>{error&&<p role="alert">{error}</p>}
    <button onClick={()=>signOut().catch(cause=>setError(cause.message))}>Cancelar e sair</button>
  </section></main>;
}
