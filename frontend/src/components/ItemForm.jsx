import React,{useEffect,useRef,useState} from 'react';
import api from '../services/api';
import {productUnits} from '../services/dataMapping';
import FormModal,{useFormClose} from './FormModal';
import SaveAndContinue,{continuesRegistration,focusRegistration} from './SaveAndContinue';
import useOperation from '../hooks/useOperation';
import {registeredItem} from '../services/catalog';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';

const defaults={nome:'',produto:true,insumo:true,unidade:'UN',ativo:true,observacoes:'',codigoBarras:'',categoria:'',custo:'0',precoVenda:'0',estoqueSaidaId:'',estoqueMinimo:'',bloquearEstoqueNegativo:false,componentes:[],fornecedoresIds:[]};
const optionsFrom=data=>data.map(row=>row.key?row:row.codigoInsumo?registeredItem(null,row):registeredItem(row));
export default function ItemForm({item=null,initialValues={},onClose,onSuccess}){
 const initial=useRef({...defaults,...initialValues,...item,estoqueMinimo:item?.estoqueMinimo??initialValues.estoqueMinimo??''});
 const [form,setForm]=useState(initial.current),[options,setOptions]=useState([]),[suppliers,setSuppliers]=useState([]),[locations,setLocations]=useState([]);
 const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState(''),[slots,setSlots]=useState(Math.max(3,form.fornecedoresIds.length));
 const [mode,setMode]=useState(form.componentes.length>1?'RECIPE':form.componentes.length?'SINGLE':'NONE');
 const {busy,error,run}=useOperation(),request=useRef({});
 async function load(){setLoading(true);setLoadError('');try{
  const [items,vendors,stocks]=await Promise.all([api.get('/itens'),api.get('/fornecedores'),api.get('/estoques')]);
  setOptions(optionsFrom(items.data));setSuppliers(vendors.data);setLocations(stocks.data.locations??[]);
 }catch{setLoadError('Não foi possível carregar os cadastros e estoques. Tente novamente.');}finally{setLoading(false);}}
 useEffect(()=>{let live=true;Promise.all([api.get('/itens'),api.get('/fornecedores'),api.get('/estoques')]).then(([items,vendors,stocks])=>{
  if(live){setOptions(optionsFrom(items.data));setSuppliers(vendors.data);setLocations(stocks.data.locations??[]);}
 }).catch(()=>{if(live)setLoadError('Não foi possível carregar os cadastros e estoques. Tente novamente.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
 const dirty=JSON.stringify(form)!==JSON.stringify(initial.current),close=useFormClose(onClose,dirty,busy);
 const change=(key,value)=>{setNotice('');setForm(previous=>({...previous,[key]:value}));};
 function useChanged(key,value){
  setNotice('');setForm(previous=>({...previous,[key]:value,...(!value&&key==='insumo'&&!item?.insumo?{codigoInsumo:null,stockId:'',stockUpdatedAt:null}:{}),...(!value&&key==='produto'&&!item?.produto?{codigoProduto:null,productUpdatedAt:null}:{})}));
 }
 const available=options.filter(option=>option.insumo&&option.stockId);
 function linkStock(code){
  const selected=options.find(option=>String(option.codigoInsumo)===code&&option.insumo&&!option.produto);
  setForm(previous=>({...previous,codigoInsumo:selected?.codigoInsumo??null,stockId:selected?.stockId??'',stockUpdatedAt:selected?.stockUpdatedAt??null,
   unidade:selected?.unidade??initial.current.unidade,estoqueMinimo:selected?.estoqueMinimo??'',bloquearEstoqueNegativo:selected?.bloquearEstoqueNegativo??false,fornecedoresIds:selected?.fornecedoresIds??[]}));
 }
 function linkProduct(code){
  const selected=options.find(option=>String(option.codigoProduto)===code&&option.produto&&!option.insumo);
  setForm(previous=>({...previous,codigoProduto:selected?.codigoProduto??null,productUpdatedAt:selected?.productUpdatedAt??null,
   codigoBarras:selected?.codigoBarras??'',categoria:selected?.categoria??'',custo:selected?.custo??'0',precoVenda:selected?.precoVenda??'0',estoqueSaidaId:selected?.estoqueSaidaId??''}));
 }
 function consumption(next){
  if(form.componentes.length&&!window.confirm('Trocar a forma de consumo e limpar a composição atual?'))return;
  setMode(next);change('componentes',next==='NONE'?[]:[{stock_item_id:'',quantidade:'1'}]);
 }
 async function save(event){
  event.preventDefault();const keepOpen=continuesRegistration(event),target=event.currentTarget;
  if(!form.produto&&!form.insumo){await run(()=>Promise.reject(new Error('Marque Produto, Insumo ou ambos.'))).catch(()=>{});return;}
  const linking=form.produto&&form.insumo&&(form.codigoProduto!==initial.current.codigoProduto&&form.codigoProduto||form.codigoInsumo!==initial.current.codigoInsumo&&form.codigoInsumo);
  if(linking&&!window.confirm('Unificar estes cadastros? O item passa a consumir seu próprio estoque, na proporção 1 para 1. Os saldos, notas e históricos existentes serão preservados.'))return;
  const body={...form,componentes:form.produto&&!form.insumo&&mode!=='NONE'?form.componentes:[],fornecedoresIds:form.fornecedoresIds.filter(Boolean)};
  body.abastecimento=form.produto&&form.insumo?(form.abastecimento??'DIRECT'):'DIRECT';
  const serialized=JSON.stringify(body);if(request.current.body!==serialized)request.current={body:serialized,id:crypto.randomUUID()};
  try{const {data}=await run(()=>api.post('/itens',{...body,requestId:request.current.id}));
   if(keepOpen){const next={...defaults,...initialValues,nome:'',codigoBarras:'',componentes:[],fornecedoresIds:[]};initial.current=next;setForm(next);setMode('NONE');setSlots(3);request.current={};setNotice('Item salvo. Preencha o próximo cadastro.');focusRegistration({currentTarget:target});load();}
   onSuccess('Item salvo com sucesso.',data,keepOpen);
  }catch{/* Keep the same request and form for a safe retry. */}
 }
 return <FormModal labelledBy="item-form-title" dirty={dirty} busy={busy} onClose={close}><div className="users-editor product-editor">
  <div className="users-editor-heading"><h2 id="item-form-title">{item?'Editar item':'Novo item'}</h2><button type="button" aria-label="Fechar formulário" disabled={busy} onClick={close}>×</button></div>
  <p className="users-editor-intro">Um cadastro para venda, estoque ou ambos.</p>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  {loading&&<p role="status">Carregando cadastros…</p>}
  {loadError&&<p role="alert" className="users-message users-error">{loadError} <button disabled={loading} onClick={load}>Tentar novamente</button></p>}
  <form onSubmit={save}><fieldset disabled={busy||loading||!!loadError} className="product-fields">
   <label className="product-wide">Nome do item<input required autoFocus maxLength={200} value={form.nome} onChange={event=>change('nome',event.target.value)}/></label>
   <section className="product-wide item-types" aria-label="Uso do item">
    <label className="inventory-toggle"><input type="checkbox" checked={form.produto} disabled={!!item?.produto} onChange={event=>useChanged('produto',event.target.checked)}/> Produto — disponível para venda</label>
    <label className="inventory-toggle"><input type="checkbox" checked={form.insumo} disabled={!!item?.insumo} onChange={event=>useChanged('insumo',event.target.checked)}/> Insumo — controla estoque</label>
   </section>
   {item&&<small className="product-wide">Você pode acrescentar um uso ao item. Para encerrar usos já cadastrados, desative-o e preserve os vínculos e o histórico.</small>}
   {form.produto&&form.insumo&&!initial.current.insumo&&<label className="product-wide">Estoque próprio<select value={form.codigoInsumo??''} onChange={event=>linkStock(event.target.value)}><option value="">Criar estoque deste item</option>{options.filter(option=>option.insumo&&!option.produto&&option.ativo).map(option=><option key={option.key} value={option.codigoInsumo}>Usar insumo existente: {option.nome} / {option.unidade}</option>)}</select></label>}
   {form.produto&&form.insumo&&initial.current.insumo&&!initial.current.produto&&<label className="product-wide">Produto para venda<select value={form.codigoProduto??''} onChange={event=>linkProduct(event.target.value)}><option value="">Criar produto deste item</option>{options.filter(option=>option.produto&&!option.insumo&&option.ativo).map(option=><option key={option.key} value={option.codigoProduto}>Usar produto existente: {option.nome}</option>)}</select></label>}
   <label>Unidade<select disabled={!!form.codigoInsumo} value={form.unidade} onChange={event=>change('unidade',event.target.value)}>{productUnits.map(unit=><option key={unit}>{unit}</option>)}</select></label>
   <label>Situação<select value={String(form.ativo)} onChange={event=>change('ativo',event.target.value==='true')}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
   {form.produto&&<>
    <label className="product-wide">Código de barras (opcional)<input value={form.codigoBarras} maxLength={64} onChange={event=>change('codigoBarras',event.target.value)}/></label>
    <label>Categoria<input value={form.categoria} maxLength={100} onChange={event=>change('categoria',event.target.value)}/></label>
    <label>Custo (R$)<input required type="number" min="0" max="9999999999.99" step="0.000001" value={form.custo} onChange={event=>change('custo',event.target.value)}/></label>
    <label>Preço de venda (R$)<input required type="number" min="0" max="9999999999.99" step="0.01" value={form.precoVenda} onChange={event=>change('precoVenda',event.target.value)}/></label>
    <label>Estoque de saída<select value={form.estoqueSaidaId} onChange={event=>change('estoqueSaidaId',event.target.value)}><option value="">Principal (padrão)</option>{locations.filter(location=>!location.principal&&(location.ativo||location.id===form.estoqueSaidaId)).map(location=><option key={location.id} value={location.id}>{location.nome}{location.ativo?'':' (inativo)'}</option>)}</select></label>
    <label className="product-wide">Abastecimento / baixa de estoque<select value={form.insumo?(form.abastecimento??'DIRECT'):'DIRECT'} onChange={event=>{setNotice('');setForm(previous=>({...previous,abastecimento:event.target.value,...(event.target.value==='PRODUCTION'?{insumo:true}:{})}));}}><option value="DIRECT">{form.insumo?'Estoque próprio — baixa 1 para 1 na venda':'Consumo direto de insumos — composição na venda'}</option><option value="PRODUCTION">Abastecido por produção — venda baixa o produto acabado</option></select></label>
    {form.insumo&&form.abastecimento==='PRODUCTION'&&<p className="product-wide inventory-preview">Cadastre a ficha técnica em Estoque → Produção. A produção baixa os ingredientes e abastece este item; a venda baixa somente o produto acabado.</p>}
    {form.insumo?<p className="product-wide inventory-preview">Consumo automático: cada unidade vendida baixa 1 {form.unidade} do próprio item.</p>:<section className="product-wide product-composition" aria-label="Composição de estoque"><h3>Consumo por venda</h3>
     <label>Forma de consumo<select value={mode} onChange={event=>consumption(event.target.value)}><option value="NONE">Sem baixa de estoque</option><option value="SINGLE">Um insumo / item com estoque</option><option value="RECIPE">Lista de insumos (receita)</option></select></label>
     {mode!=='NONE'&&<><p>Informe o consumo por unidade vendida. Exemplo: um pacote de 12 consome 12 latas; um bolo consome as quantidades dos ingredientes da receita.</p>
      {form.componentes.map((component,index)=><div className="product-component" key={index}>
       <label>Insumo {index+1}<select required value={component.stock_item_id} onChange={event=>change('componentes',form.componentes.map((row,i)=>i===index?{...row,stock_item_id:event.target.value}:row))}><option value="">Selecione um item com estoque</option>{available.map(option=><option key={option.stockId} disabled={!option.ativo&&option.stockId!==component.stock_item_id||form.componentes.some((row,i)=>i!==index&&row.stock_item_id===option.stockId)} value={option.stockId}>{option.nome} / {option.unidade}{option.produto?' · Produto e insumo':''}{option.ativo?'':' (inativo)'}</option>)}</select></label>
       <label>Consumo {index+1}<input required type="number" min="0.001" step="0.001" value={component.quantidade} onChange={event=>change('componentes',form.componentes.map((row,i)=>i===index?{...row,quantidade:event.target.value}:row))}/></label>
       {mode==='RECIPE'&&<button type="button" className="users-edit" disabled={form.componentes.length===1} onClick={()=>change('componentes',form.componentes.filter((_,i)=>i!==index))}>Remover insumo {index+1}</button>}
      </div>)}
      {mode==='RECIPE'&&<button type="button" className="users-secondary" disabled={form.componentes.length>=50} onClick={()=>change('componentes',[...form.componentes,{stock_item_id:'',quantidade:'1'}])}>Adicionar insumo à receita</button>}
     </>}
    </section>}
   </>}
   {form.insumo&&<>
    <label>Estoque mínimo (opcional)<input type="number" min="0" step="0.001" value={form.estoqueMinimo} onChange={event=>change('estoqueMinimo',event.target.value)}/></label>
    <label><span className="inventory-toggle"><input type="checkbox" checked={form.bloquearEstoqueNegativo} onChange={event=>change('bloquearEstoqueNegativo',event.target.checked)}/> Bloquear saída com estoque negativo</span></label>
    <small className="product-wide">O saldo começa em zero; entradas e inventários alteram o estoque. Deixe o mínimo vazio para não gerar alertas de compra.</small>
    <section className="product-wide product-composition"><h3>Fornecedores do item</h3>{Array.from({length:slots},(_,index)=><label key={index}>Fornecedor {index+1}<select value={form.fornecedoresIds[index]??''} onChange={event=>{const ids=[...form.fornecedoresIds];ids[index]=event.target.value;change('fornecedoresIds',ids);}}><option value="">Não informado</option>{suppliers.filter(supplier=>supplier.ativo||supplier._id===form.fornecedoresIds[index]).map(supplier=><option key={supplier._id} value={supplier._id} disabled={form.fornecedoresIds.some((id,i)=>i!==index&&id===supplier._id)}>{supplier.nome}{supplier.ativo?'':' (inativo)'}</option>)}</select></label>)}<button type="button" className="users-secondary" disabled={slots>=50} onClick={()=>setSlots(count=>count+1)}>Mais um fornecedor</button></section>
   </>}
   <label className="product-wide">Observações<textarea rows={3} maxLength={2000} value={form.observacoes} onChange={event=>change('observacoes',event.target.value)}/></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Salvando…':'Salvar item'}</button><SaveAndContinue editing={!!item}/></div>
  </fieldset></form>
 </div></FormModal>;
}
