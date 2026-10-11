import React from 'react';

export function continuesRegistration(event){
 return event.nativeEvent?.submitter?.value==='continue';
}

export default function SaveAndContinue({editing=false,disabled=false}){
 return !editing&&<button type="submit" name="registrationAction" value="continue" className="users-secondary" disabled={disabled}>Salvar e continuar</button>;
}

export function focusRegistration(event){
 const form=event.currentTarget;
 requestAnimationFrame(()=>form?.querySelector('input:not([disabled])')?.focus());
}
