import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import Destinatarios from './Destinatarios';
vi.mock('../services/api',()=>({default:{get:vi.fn().mockResolvedValue({data:[{_id:'a',codigoDestinatario:1,nome:'Loja A',documento:'19131243000197',ativo:true},{_id:'b',codigoDestinatario:2,nome:'Loja B',documento:'41817328000109',ativo:true}]})}}));
it('lists masked branch documents and searches by unformatted CNPJ',async()=>{
 render(<Destinatarios/>);await screen.findByText('Loja A');expect(screen.getByText('19.131.243/0001-97')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Buscar destinatários'),{target:{value:'41817328000109'}});expect(screen.queryByText('Loja A')).not.toBeInTheDocument();expect(screen.getByText('Loja B')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Novo destinatário'}));expect(await screen.findByRole('dialog',{name:'Novo destinatário'})).toBeInTheDocument();
});
