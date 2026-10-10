import React,{useEffect,useState} from 'react';
import api from '../services/api';
import FinancialConfigForm from '../components/FinancialConfigForm';
import {accountTypes,methodTypes,money} from '../services/finance';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
const labels={accounts:'Contas financeiras',categories:'Categorias',methods:'Formas de pagamento'};
export default function FinancialSettings(){
 const [data,setData]=useState({accounts:[],categories:[],methods:[]}),[tab,setTab]=useState('accounts'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState(null);
 async function load(){setLoading(true);setError('');try{const {data}=await api.get('/financeiro');setData(data);}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{let active=true;api.get('/financeiro').then(({data})=>{if(active)setData(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">FINANCEIRO</p><h1>Configurações financeiras</h1><p>Prepare as contas, categorias e formas de pagamento para a operação da loja.</p></div><button className="users-primary" disabled={loading} onClick={()=>setEditor({})}>+ Novo cadastro</button></header>{error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  <div className="invoice-actions" role="group" aria-label="Cadastros financeiros">{Object.entries(labels).map(([kind,label])=><button key={kind} className={tab===kind?'users-primary':'users-secondary'} aria-pressed={tab===kind} onClick={()=>setTab(kind)}>{label}</button>)}</div>
  <section className="users-list"><div className="product-list-heading"><h2>{labels[tab]}</h2><button className="users-secondary" onClick={load} disabled={loading}>Atualizar</button></div><div className="users-table-wrap"><table><thead><tr><th>Nome</th><th>Detalhes</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{loading?<tr><td colSpan={4}>Carregando…</td></tr>:!data[tab].length?<tr><td colSpan={4} className="users-empty">Nenhum cadastro. Cadastre a primeira conta para começar.</td></tr>:data[tab].map(row=><tr key={row.id}><td><strong>{row.nome}</strong></td><td>{tab==='accounts'?<>{accountTypes[row.tipo]}<div className={row.saldo<0?'inventory-low':''}>Saldo: {money(row.saldo)}</div></>:tab==='categories'?({INCOME:'Receita',EXPENSE:'Despesa',BOTH:'Receita e despesa'}[row.natureza]):<>{methodTypes[row.tipo]} · até {row.max_parcelas} parcela(s) · {row.prazo_dias} dia(s)<div>Conta: {data.accounts.find(a=>a.id===row.conta_padrao_id)?.nome??'Selecionar no lançamento'} · {row.usar_pdv?'Disponível para o PDV':'Fora do PDV'}</div></>}</td><td>{row.ativo?'Ativo':'Inativo'}</td><td><button className="users-edit" onClick={()=>setEditor(row)}>Editar</button></td></tr>)}</tbody></table></div></section>
  <p className="product-note">Saldos são calculados pelo extrato. Cadastros podem ser desativados sem apagar o histórico. Valores de cartões podem ser separados do dinheiro disponível usando uma conta do tipo Valores de cartões.</p>
  {editor&&<FinancialConfigForm kind={tab} item={editor.id?editor:null} accounts={data.accounts} onClose={()=>setEditor(null)} onSuccess={message=>{setEditor(null);setNotice(message);load();}}/>}
 </div>;
}
