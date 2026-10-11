import React from 'react';
import {Link} from 'react-router-dom';
import '../styles/pages/Users.css';
const reports=[
 {title:'Financeiro',description:'Contas a receber, contas a pagar e saldos bancários.',path:'/relatorios/financeiro',label:'Abrir relatório financeiro'},
 {title:'Estoque',description:'Saldos por insumo, itens negativos e abaixo do mínimo.',path:'/relatorios/estoque',label:'Abrir relatório de estoque'},
 {title:'Produções',description:'Lotes, ingredientes consumidos, rendimentos previstos e realizados e custos estimados.',path:'/relatorios/producao',label:'Abrir relatório de produções'},
 {title:'Registros de operações',description:'Histórico de ações e responsáveis · Em breve.',path:'/relatorios/logs',label:'Ver registros de operações'},
 {title:'Vendas e notas fiscais',description:'Vendas com nota gerada e sem nota gerada · Em breve.',path:'/relatorios/vendas-notas',label:'Ver vendas e notas fiscais'},
];
export default function Relatorios(){
 return <div className="users-page"><header className="users-heading"><div><p className="home-eyebrow">RELATÓRIOS</p><h1>Relatórios</h1><p>Consulte os resultados financeiros e a posição do estoque.</p></div></header><div className="users-stats">{reports.map(report=><div key={report.path}><h2>{report.title}</h2><p>{report.description}</p><Link to={report.path}>{report.label}</Link></div>)}</div></div>;
}
