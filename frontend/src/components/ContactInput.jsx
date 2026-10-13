import React,{useRef} from 'react';
import {documentCharacters,phoneDigits,formatDocument,formatPhone} from '../utils/contactMasks';

export default function ContactInput({kind='document',value,onChange,onKeyDown,...props}){
 const ref=useRef(null),document=kind==='document';
 const normalize=document?documentCharacters:phoneDigits;
 const format=document?formatDocument:formatPhone;
 function notify(event,raw,position){
  onChange?.({...event,target:{name:props.name,id:props.id,value:raw}});
  requestAnimationFrame(()=>{
   const input=ref.current;if(!input||globalThis.document.activeElement!==input)return;
   let count=0,cursor=0;
   while(cursor<input.value.length&&count<position){if(/[a-z\d]/i.test(input.value[cursor]))count++;cursor++;}
   input.setSelectionRange(cursor,cursor);
  });
 }
 function change(event){
  const position=normalize(event.target.value.slice(0,event.target.selectionStart)).length;
  notify(event,normalize(event.target.value).slice(0,document?14:13),position);
 }
 function keyDown(event){
  onKeyDown?.(event);if(event.defaultPrevented)return;
  const input=event.currentTarget,start=input.selectionStart,end=input.selectionEnd;
  if(start!==end||!['Backspace','Delete'].includes(event.key))return;
  const adjacent=input.value[event.key==='Backspace'?start-1:start];
  if(!adjacent||/[a-z\d]/i.test(adjacent))return;
  const position=normalize(input.value.slice(0,start)).length;
  const index=event.key==='Backspace'?position-1:position,raw=normalize(input.value);
  if(index<0||index>=raw.length)return;
  event.preventDefault();notify(event,raw.slice(0,index)+raw.slice(index+1),index);
 }
 return <input {...props} ref={ref} type={document?'text':'tel'} inputMode={document?'text':'tel'} value={format(value)} onChange={change} onKeyDown={keyDown}/>;
}
