import React,{useState} from 'react';
import {it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import ContactInput from '../../components/ContactInput';
function Fixture({kind='document',initial=''}){
 const [value,setValue]=useState(initial);
 return <><ContactInput kind={kind} aria-label="Contato" value={value} onChange={event=>setValue(event.target.value)}/><output aria-label="Valor salvo">{value}</output></>;
}
it('masks pasted documents while passing the unformatted value to the form',()=>{
 render(<Fixture/>);const input=screen.getByLabelText('Contato');
 fireEvent.change(input,{target:{value:'07.196.033/0023-03'}});
 expect(input).toHaveValue('07.196.033/0023-03');
 expect(screen.getByLabelText('Valor salvo')).toHaveTextContent('07196033002303');
 fireEvent.change(input,{target:{value:''}});expect(input).toHaveValue('');
});
it('allows backspace over separators instead of restoring them indefinitely',()=>{
 render(<Fixture initial="01234567890"/>);const input=screen.getByLabelText('Contato');
 input.setSelectionRange(4,4);fireEvent.keyDown(input,{key:'Backspace'});
 expect(screen.getByLabelText('Valor salvo')).toHaveTextContent('0134567890');
});
it('masks existing and newly entered phones',()=>{
 render(<Fixture kind="phone" initial="7133334444"/>);const input=screen.getByLabelText('Contato');
 expect(input).toHaveValue('(71) 3333-4444');
 fireEvent.change(input,{target:{value:'71999998888'}});
 expect(input).toHaveValue('(71) 99999-8888');
});
