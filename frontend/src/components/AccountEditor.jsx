import MoneyInput from './MoneyInput';
import React,{useEffect,useMemo,useState} from 'react';
import api from '../services/api';
import FormModal,{useFormClose} from './FormModal';
import {decimalMoney} from '../services/decimalMoney';
function localDate(value){
  if(!value)return '';
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  return ['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');
}
export default function AccountEditor({conta,onClose,onSuccess}){
  const [categories,setCategories]=useState([]),[category,setCategory]=useState(conta?.categoriaId??'');
  useEffect(()=>{let active=true;api.get('/financeiro').then(({data})=>{if(active)setCategories(data?.categories??[]);}).catch(()=>{});return()=>{active=false;};},[]);
  const [customers,setCustomers]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
  const [customer,setCustomer]=useState(String(conta?.codigoCliente||'')),[type,setType]=useState(conta?.tipo||'debito');
  const initialCustomerText=conta ? [conta.clienteNome,conta.clienteApelido,'#'+conta.codigoCliente].filter(Boolean).join(' · ') : '';
  const [customerQuery,setCustomerQuery]=useState(initialCustomerText);
  const [showCustomers,setShowCustomers]=useState(false),[activeCustomer,setActiveCustomer]=useState(-1);
  const customerOptions=useMemo(()=>{
    const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const query=customer?'':normalize(customerQuery).trim();
    return customers.filter(c=>(c.ativo||String(c.codigoCliente)===String(conta?.codigoCliente))&&
      normalize([c.nome,c.apelido,'#'+c.codigoCliente].join(' ')).includes(query));
  },[customers,customerQuery,customer,conta?.codigoCliente]);
  function chooseCustomer(selected){
    setCustomer(String(selected.codigoCliente));
    setCustomerQuery([selected.nome,selected.apelido,'#'+selected.codigoCliente].filter(Boolean).join(' · '));
    setShowCustomers(false);setActiveCustomer(-1);
  }
  function customerKey(event){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setShowCustomers(true);
      setActiveCustomer(index=>event.key==='ArrowDown'?Math.min(index+1,customerOptions.length-1):Math.max(index-1,0));
    }else if(event.key==='Enter'&&showCustomers){
      event.preventDefault();if(customerOptions[activeCustomer])chooseCustomer(customerOptions[activeCustomer]);
    }else if(event.key==='Escape'&&showCustomers){
      event.preventDefault();event.stopPropagation();setShowCustomers(false);
    }
  }
  const [amount,setAmount]=useState(conta?String(conta.valor):''),[due,setDue]=useState(localDate(conta?.dataVencimento));
  const [notes,setNotes]=useState(conta?.observacoes||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dirty=customerQuery!==initialCustomerText||category!==(conta?.categoriaId??'')||customer!==String(conta?.codigoCliente||'')||type!==(conta?.tipo||'debito')||amount!==(conta?String(conta.valor):'')||due!==localDate(conta?.dataVencimento)||notes!==(conta?.observacoes||'');
  const requestClose=useFormClose(onClose,dirty,busy);
  async function loadCustomers(){
    setLoading(true);setLoadError('');
    try{const {data}=await api.get('/clientes');setCustomers(data);}
    catch{setLoadError('Não foi possível carregar os clientes. Tente novamente.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{let active=true;api.get('/clientes').then(({data})=>{if(active)setCustomers(data);}).catch(()=>{if(active)setLoadError('Não foi possível carregar os clientes. Tente novamente.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  async function save(event){
    event.preventDefault();setError('');
    let value;try{value=decimalMoney(amount);}catch(cause){setError(cause.message);return;}
    if(!customer||!Number.isFinite(value)||value<=0){setError('Selecione um cliente e informe um valor maior que zero.');return;}
    const selected=customers.find(c=>String(c.codigoCliente)===customer);
    if(!selected){setError('Selecione um cliente nos resultados da busca.');return;}
    if(!conta&&type==='debito'&&selected?.status!=='liberado'){setError('Este cliente está bloqueado para novos débitos.');return;}
    setBusy(true);
    try{
      const body={codigoCliente:Number(customer),tipo:type,valor:value,observacoes:notes,...(category||conta?.categoriaId?{categoriaId:category}:{})};
      if(due)body.dataVencimento=due;
      if(conta)await api.put('/contas/'+conta.codigoConta,body);else await api.post('/contas',body);
      onSuccess(conta?'Lançamento atualizado. O saldo do cliente foi recalculado.':'Lançamento registrado. O saldo do cliente foi recalculado.');
    }catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  async function remove(){
    if(!window.confirm('Excluir este lançamento? O saldo do cliente será recalculado. Esta ação não pode ser desfeita.'))return;
    setBusy(true);setError('');
    try{await api.delete('/contas/'+conta.codigoConta);onSuccess('Lançamento excluído. O saldo do cliente foi recalculado.');}
    catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  return <FormModal labelledBy="account-editor-title" onClose={requestClose} dirty={dirty} busy={busy}><section className="users-editor accounts-editor" aria-labelledby="account-editor-title"><div className="users-editor-heading"><div><p className="home-eyebrow">{conta?'EDITAR LANÇAMENTO':'NOVO LANÇAMENTO'}</p><h2 id="account-editor-title">{conta?'Lançamento #'+conta.codigoConta:'Registrar lançamento'}</h2></div><button aria-label="Fechar formulário" onClick={requestClose} disabled={busy}>×</button></div><p className="users-editor-intro">Informe o cliente, o tipo e o valor da movimentação.</p>
    {loadError&&<div className="users-message users-error" role="alert">{loadError}<button className="users-edit" onClick={loadCustomers}>Tentar novamente</button></div>}
    <form onSubmit={save} aria-busy={busy}><fieldset disabled={busy||loading||!!loadError}>
      <label htmlFor="account-customer">Cliente</label>
      <div className="accounts-customer-picker">
        <input id="account-customer" role="combobox" autoComplete="off" required
          aria-autocomplete="list" aria-expanded={showCustomers} aria-controls="account-customer-results"
          aria-activedescendant={showCustomers&&customerOptions[activeCustomer]?'account-customer-option-'+customerOptions[activeCustomer].codigoCliente:undefined}
          placeholder={loading?'Carregando clientes…':'Digite nome, apelido ou código'} value={customerQuery}
          onFocus={()=>setShowCustomers(true)} onBlur={()=>setShowCustomers(false)} onKeyDown={customerKey}
          onChange={event=>{setCustomerQuery(event.target.value);setCustomer('');setShowCustomers(true);setActiveCustomer(-1);}}/>
        {showCustomers&&<ul id="account-customer-results" role="listbox" aria-label="Clientes encontrados">
          {customerOptions.length?customerOptions.map((c,index)=><li key={c.codigoCliente} role="option"
            id={'account-customer-option-'+c.codigoCliente} aria-selected={index===activeCustomer}
            onMouseDown={event=>event.preventDefault()} onClick={()=>chooseCustomer(c)}>
            <strong>{c.nome}</strong><span>#{c.codigoCliente}{c.apelido?' · '+c.apelido:''}{!c.ativo?' (inativo)':''}</span>
          </li>):<li className="accounts-customer-empty" role="status">Nenhum cliente encontrado.</li>}
        </ul>}
      </div>
      <label htmlFor="account-type">Tipo de lançamento</label><select id="account-type" value={type} onChange={e=>setType(e.target.value)}><option value="debito">Débito</option><option value="credito">Crédito</option></select><p className="users-permission-help">{type==='credito'?'O crédito reduz o valor devido pelo cliente.':'O débito aumenta o valor devido pelo cliente.'}</p>
      <label htmlFor="account-amount">Valor</label><MoneyInput id="account-amount" type="number" min="0.000001" step="0.000001" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00" required/>
      <label htmlFor="account-due">Data de vencimento</label><input id="account-due" type="date" value={due} onChange={e=>setDue(e.target.value)}/>{!conta&&<small>Se não informada, o vencimento será em 30 dias.</small>}
      <label htmlFor="account-category">Categoria de receita (opcional)</label><select id="account-category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Sem categoria</option>{categories.filter(c=>c.ativo&&['INCOME','BOTH'].includes(c.natureza)).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select>
      <label htmlFor="account-notes">Observações</label><textarea id="account-notes" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Informações adicionais (opcional)" rows={3}/>
    </fieldset>{error&&<p className="users-message users-error" role="alert">{error}</p>}
    <div className="users-form-actions"><button type="button" className="users-secondary" onClick={requestClose} disabled={busy}>Cancelar</button><button className="users-primary" disabled={busy||loading||!!loadError}>{busy?'Salvando…':'Salvar lançamento'}</button></div></form>
    {conta&&<div className="accounts-danger-zone"><p>A exclusão remove o lançamento e atualiza o saldo do cliente.</p><button onClick={remove} disabled={busy}>Excluir lançamento</button></div>}
  </section></FormModal>;
}
