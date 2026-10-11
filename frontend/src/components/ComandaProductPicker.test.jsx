import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import ComandaProductPicker from './ComandaProductPicker';
const mock=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
it('adds an exact barcode using the server product price and current balance snapshot',async()=>{
 mock.post.mockResolvedValue({data:{}});const onSaved=vi.fn();
 render(<ComandaProductPicker comanda={{id:'pdv',total_geral:20,paid_total:5}} products={[{_id:'p1',nome:'Coca',codigoBarras:'00123',codigoProduto:1,precoVenda:10,ativo:true}]} onSaved={onSaved}/>);
 fireEvent.change(screen.getByLabelText('Buscar produto ou código de barras'),{target:{value:'00123'}});fireEvent.change(screen.getByLabelText('Quantidade do produto'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Adicionar produto'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({id:'pdv',action:'ADD_PRODUCT',data:expect.objectContaining({total:20,paid_total:5,product_id:'p1',quantidade:2})})));
 expect(onSaved).toHaveBeenCalled();
});
