import React,{useState} from 'react';
import {expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MoneyInput from '../../components/MoneyInput';
function Field({initial='',onChange=()=>{},...props}){
 const [value,setValue]=useState(initial);
 return <MoneyInput aria-label="Valor" value={value} onChange={event=>{setValue(event.target.value);onChange(event.target.value);}} {...props}/>;
}
it('fills cents from right to left, groups thousands and shifts back on deletion',()=>{
 const changed=vi.fn();render(<Field onChange={changed}/>);
 const input=screen.getByLabelText('Valor');
 expect(input).toHaveAttribute('placeholder','0,00');
 userEvent.type(input,'1');expect(input).toHaveValue('0,01');
 userEvent.type(input,'2');expect(input).toHaveValue('0,12');
 userEvent.type(input,'3');expect(input).toHaveValue('1,23');
 userEvent.type(input,'456');expect(input).toHaveValue('1.234,56');
 expect(changed).toHaveBeenLastCalledWith('1234.56');
 userEvent.type(input,'{backspace}');expect(input).toHaveValue('123,45');
 fireEvent.change(input,{target:{value:''}});expect(input).toHaveValue('');
});
it('preserves loaded precision and accepts pasted Brazilian amounts without changing payload units',()=>{
 const changed=vi.fn();render(<Field initial="123.456789" onChange={changed}/>);
 const input=screen.getByLabelText('Valor');
 expect(input).toHaveValue('123,456789');expect(changed).not.toHaveBeenCalled();
 fireEvent.paste(input,{clipboardData:{getData:()=> 'R$ 1.234,56'}});
 expect(input).toHaveValue('1.234,56');expect(changed).toHaveBeenLastCalledWith('1234.56');
});
it('retains required, min and max validation after replacing number inputs',()=>{
 render(<Field min="0.01" max="20" required/>);
 const input=screen.getByLabelText('Valor');expect(input).toBeInvalid();
 fireEvent.change(input,{target:{value:'0'}});expect(input).toBeInvalid();
 fireEvent.change(input,{target:{value:'2001'}});expect(input).toBeInvalid();
 fireEvent.change(input,{target:{value:'2000'}});expect(input).toBeValid();
});
it('allows negative balances only on fields that support them',()=>{
 render(<Field allowNegative initial="5"/>);
 const input=screen.getByLabelText('Valor');
 fireEvent.keyDown(input,{key:'-'});expect(input).toHaveValue('-5,00');
 fireEvent.keyDown(input,{key:'-'});expect(input).toHaveValue('5,00');
});
it('keeps cost fields at six decimal places with right-to-left input',()=>{
 const changed=vi.fn();render(<Field decimalPlaces={6} onChange={changed}/>);
 const input=screen.getByLabelText('Valor');
 expect(input).toHaveAttribute('placeholder','0,000000');
 userEvent.type(input,'1');expect(input).toHaveValue('0,000001');
 userEvent.type(input,'234567');expect(input).toHaveValue('1,234567');
 expect(changed).toHaveBeenLastCalledWith('1.234567');
});
