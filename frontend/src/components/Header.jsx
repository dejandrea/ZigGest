import React,{useState} from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import '../styles/components/Header.css';
import '../styles/pages/Access.css';
import logo from '../assets/logoConveniência.jpg';

export default function Header() {
  const {profile,isAdmin,signOut}=useAuth();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function logout() {
    setBusy(true);setError('');
    try {await signOut();} catch(cause){setError(cause.message);} finally {setBusy(false);}
  }
  return <header className="header">
    <img className="logoCliente" src={logo} alt="logo loja"/>
    <div className="logoSistema"><h2 className="nomeSistema">ZigGest</h2><span className="sloganSistema">Gestão fácil e rápida para seu negócio</span></div>
    <div className="session-controls"><span>{profile?.nome}</span>{isAdmin&&<Link to="/usuarios">Usuários</Link>}<Link to="/alterar-senha">Alterar senha</Link><button onClick={logout} disabled={busy}>Sair</button></div>
    {error&&<p role="alert">{error}</p>}
  </header>;
}
