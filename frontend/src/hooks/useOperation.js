import { useCallback,useState,useRef } from 'react';
export default function useOperation() {
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const pending=useRef(0);
  const run=useCallback(async action=>{
    pending.current++;setBusy(true);setError('');
    try {return await action();}
    catch(cause){setError(cause.message||'Não foi possível concluir.');throw cause;}
    finally {pending.current--;setBusy(pending.current>0);}
  },[]);
  return {error,busy,run,setError};
}
