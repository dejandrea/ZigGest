import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase, configurationError } from '../services/supabase';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState(configurationError);
  const [recovery,setRecovery] = useState(false);
  const revision = useRef(0);
  const currentUser = useRef(null);
  const refresh = useCallback(async currentSession => {
    const request = ++revision.current;
    if (!currentSession) {
      currentUser.current=null;setSession(null); setProfile(null); setLoading(false); return;
    }
    if (currentUser.current !== currentSession.user.id) {
      currentUser.current=currentSession.user.id;setProfile(null);setLoading(true);
    }
    setSession(currentSession);
    try {
      const { data: verified,error: userError } = await supabase.auth.getUser();
      if (userError || !verified.user || verified.user.id !== currentSession.user.id) throw new Error('Sessão expirada. Entre novamente.');
      const { data,error: profileError } = await supabase.rpc('my_app_profile');
      if (profileError) throw new Error('Não foi possível verificar suas permissões.');
      if (request !== revision.current) return;
      setProfile(data?.[0] ?? null);
      setError(data?.[0] ? null : 'Seu acesso está desativado ou ainda não foi autorizado.');
    } catch (cause) {
      if (request === revision.current) { setProfile(null);setError(cause.message); }
    } finally { if (request === revision.current) setLoading(false); }
  },[]);
  useEffect(() => {
    if (!supabase) { setLoading(false);return; }
    let active = true;
    supabase.auth.getSession().then(({data,error: initialError}) => {
      if (!active) return;
      if (initialError) { setError('Não foi possível restaurar sua sessão.');setLoading(false); }
      else refresh(data.session);
    });
    const {data} = supabase.auth.onAuthStateChange((event,next) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // Avoid awaiting other Supabase requests inside the Auth callback.
      setTimeout(() => { if (active) refresh(next); }, 0);
    });
    return () => { active=false;revision.current++;data.subscription.unsubscribe(); };
  },[refresh]);
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => refresh(session),60000);
    const onFocus = () => refresh(session);
    window.addEventListener('focus',onFocus);
    return () => { clearInterval(timer);window.removeEventListener('focus',onFocus); };
  },[session,refresh]);
  async function signOut() {
    revision.current++;
    const {error: signOutError} = await supabase.auth.signOut();
    if (signOutError) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
    setSession(null);setProfile(null);setError(null);setRecovery(false);
  }
  return <AuthContext.Provider value={{session,profile,loading,error,recovery,setRecovery,signOut,isMaster:profile?.role==='MASTER',isAdmin:['MASTER','ADMIN'].includes(profile?.role)}}>
    {children}
  </AuthContext.Provider>;
}
export function useAuth() {
  const value=useContext(AuthContext);
  if (!value) throw new Error('AuthProvider não encontrado.');
  return value;
}
