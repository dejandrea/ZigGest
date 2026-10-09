import React,{useState} from 'react';
import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import FormModal,{useFormClose} from './FormModal';
function Harness({busy=false}){
 const [open,setOpen]=useState(false),[value,setValue]=useState('');
 const close=useFormClose(()=>setOpen(false),!!value,busy);
 return <><button onClick={()=>setOpen(true)}>Abrir</button>{open&&<FormModal labelledBy="title" onClose={close} dirty={!!value} busy={busy}><h2 id="title">Formulário</h2><input aria-label="Nome" value={value} onChange={e=>setValue(e.target.value)}/><button onClick={close}>Cancelar</button></FormModal>}</>;
}
describe('form modal',()=>{
 it('preserves dirty input when discard is rejected and restores focus after closing',()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  render(<Harness/>);const trigger=screen.getByRole('button',{name:'Abrir'});trigger.focus();fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Fixture'}});
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  expect(screen.getByRole('dialog')).toBeInTheDocument();expect(screen.getByLabelText('Nome')).toHaveValue('Fixture');
  confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(trigger).toHaveFocus();confirm.mockRestore();
 });
 it('handles Escape cancellation without discarding a dirty form',()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Abrir'}));fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Fixture'}});
  const event=new Event('cancel',{cancelable:true});fireEvent(screen.getByRole('dialog'),event);
  expect(event.defaultPrevented).toBe(true);expect(confirm).toHaveBeenCalled();expect(screen.getByRole('dialog')).toBeInTheDocument();confirm.mockRestore();
 });
 it('cannot close during a save',()=>{
  render(<Harness busy/>);fireEvent.click(screen.getByRole('button',{name:'Abrir'}));
  fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
 });
});
