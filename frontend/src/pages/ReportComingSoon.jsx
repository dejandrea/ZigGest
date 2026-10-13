import React from 'react';
import {Link} from 'react-router-dom';
import '../styles/pages/Users.css';
export default function ReportComingSoon({title,description}){
 return <div className="users-page"><header className="users-heading"><div><p className="home-eyebrow">RELATÓRIOS</p><h1>{title}</h1><p>{description}</p></div></header><p className="users-message" role="status">Em breve</p><Link className="users-secondary" to="/relatorios">Ver relatórios</Link></div>;
}
