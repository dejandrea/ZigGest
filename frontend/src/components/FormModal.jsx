import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import '../styles/components/FormModal.css';
export function useFormClose(onClose,dirty,busy){
  return ()=>{
    if(busy)return;
    if(dirty&&!window.confirm('Descartar as alterações não salvas?'))return;
    onClose();
  };
}
export default function FormModal({labelledBy,onClose,dirty=false,busy=false,children}){
  const ref=useRef(null),closeRef=useRef(onClose);
  const [trigger]=useState(()=>document.activeElement);
  closeRef.current=onClose;
  useEffect(()=>{
    const dialog=ref.current;
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
    const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=oldOverflow;if(trigger?.isConnected)trigger.focus();};
  },[trigger]);
  useEffect(()=>{
    if(!dirty&&!busy)return;
    const protect=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',protect);
    return()=>window.removeEventListener('beforeunload',protect);
  },[dirty,busy]);
  return createPortal(<dialog ref={ref} className="form-modal users-page" aria-labelledby={labelledBy} aria-modal="true" onCancel={event=>{event.preventDefault();if(!busy)closeRef.current();}}>{children}</dialog>,document.body);
}
