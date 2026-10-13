import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
export default function ProtectedRoute({ admin=false }) {
  const { session,profile,loading,error,recovery,signOut }=useAuth();
  const location=useLocation();
  if (loading) return <main className="access-page" role="status">Verificando acesso…</main>;
  if (recovery) return <Navigate to="/alterar-senha" replace />;
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!profile) return <main className="access-page"><h1>Acesso indisponível</h1><p role="alert">{error}</p><button onClick={()=>signOut().catch(()=>{})}>Voltar ao login</button></main>;
  if (admin && !['MASTER','ADMIN'].includes(profile.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
