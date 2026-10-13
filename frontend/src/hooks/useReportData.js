import {useEffect,useState} from 'react';
import api from '../services/api';

export default function useReportData(path){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  api.get(path).then(result=>{if(active)setData(result.data);}).catch(()=>{if(active){setData(null);setError('Não foi possível carregar o relatório. Tente atualizar.');}}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[path,version]);
 return {data,loading,error,refresh:()=>setVersion(value=>value+1)};
}
