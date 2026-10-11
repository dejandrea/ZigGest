import React,{useEffect,useState,useCallback} from 'react';
import api from '../services/api';
export default function useStocks(){
 const [data,setData]=useState({locations:[],balances:[]}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{const {data}=await api.get('/estoques');setData(data);}catch{setError('Não foi possível carregar os estoques e setores.');}finally{setLoading(false);}},[]);
 useEffect(()=>{let active=true;api.get('/estoques').then(({data})=>{if(active)setData(data);}).catch(()=>{if(active)setError('Não foi possível carregar os estoques e setores.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 return {...data,loading,error,refresh};
}
export function sectorRows(items,balances,location){
 if(!location)return items;
 const byItem=new Map(balances.filter(b=>b.location_id===location).map(b=>[b.stock_item_id,Number(b.saldo)]));
 return items.map(item=>({...item,saldo:byItem.get(item._id)??0}));
}
export function StockSelector({locations,value,onChange}){
 return <select aria-label="Estoque / setor" value={value} onChange={e=>onChange(e.target.value)}><option value="">Todos os estoques — consolidado</option>{locations.map(l=><option key={l.id} value={l.id}>{l.nome}{l.ativo?'':' (inativo)'}</option>)}</select>;
}
