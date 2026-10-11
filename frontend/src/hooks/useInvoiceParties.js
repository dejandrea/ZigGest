import {useEffect,useState} from 'react';
import api from '../services/api';
export default function useInvoiceParties(){
 const [suppliers,setSuppliers]=useState([]),[recipients,setRecipients]=useState([]),[errors,setErrors]=useState([]),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setErrors([]);
  Promise.allSettled([api.get('/fornecedores'),api.get('/destinatarios')]).then(([vendors,companies])=>{if(!live)return;
   if(vendors.status==='fulfilled')setSuppliers(vendors.value.data);if(companies.status==='fulfilled')setRecipients(companies.value.data);
   setErrors([vendors.status==='rejected'?'Não foi possível carregar os fornecedores cadastrados.':null,companies.status==='rejected'?'Não foi possível carregar os destinatários cadastrados.':null].filter(Boolean));setLoading(false);
  });return()=>{live=false;};
 },[version]);
 return {suppliers,recipients,loading,errors,refresh:()=>setVersion(value=>value+1),supplierSaved:row=>setSuppliers(previous=>[...previous.filter(item=>item._id!==row._id),row]),recipientSaved:row=>setRecipients(previous=>[...previous.filter(item=>item._id!==row._id),row])};
}
