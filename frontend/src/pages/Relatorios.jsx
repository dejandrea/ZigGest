import React from 'react';
import {Link} from 'react-router-dom';
import '../styles/pages/Users.css';
export default function Relatorios(){
 return <div className="users-page"><header className="users-heading"><div><p className="home-eyebrow">RELATÓRIOS</p><h1>Relatórios</h1><p>Consulte os resultados financeiros e a posição do estoque.</p></div></header><div className="users-stats"><div><h2>Financeiro</h2><p>Contas a receber, contas a pagar e saldos bancários.</p><Link to="/relatorios/financeiro">Abrir relatório financeiro</Link></div><div><h2>Estoque</h2><p>Saldos por insumo, itens negativos e abaixo do mínimo.</p><Link to="/relatorios/estoque">Abrir relatório de estoque</Link></div></div></div>;
}
