import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import RecipientForm from '../../components/RecipientForm';
const api=vi.hoisted(()=>({post:vi.fn().mockResolvedValue({data:{_id:'r'}}),put:vi.fn()}));
vi.mock('../../services/api',()=>({default:api}));
it('requires a masked document and supports saving another recipient in the same form',async()=>{
 render(<RecipientForm onClose={vi.fn()} onSuccess={vi.fn()}/>);
 expect(screen.getByLabelText('CPF / CNPJ')).toBeRequired();
 fireEvent.change(screen.getByLabelText('Nome / razão social'),{target:{value:'Filial'}});fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'19131243000197'}});
 expect(screen.getByLabelText('CPF / CNPJ')).toHaveValue('19.131.243/0001-97');
 fireEvent.click(screen.getByRole('button',{name:'Salvar e continuar'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/destinatarios',expect.objectContaining({nome:'Filial'})));
 expect(screen.getByLabelText('Nome / razão social')).toHaveValue('');expect(screen.getByRole('dialog',{name:'Novo destinatário'})).toBeInTheDocument();
});
