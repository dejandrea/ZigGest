import {productFromRow,stockFromRow,productToRow,stockToRow,componentsToRows} from './dataMapping';

export function registeredItem(product=null,stock=null){
 const source=product??stock;
 return {...stock,...product,_id:source._id,key:(product?'p:':'s:')+source._id,
  produto:!!product,insumo:!!stock,productId:product?._id??'',stockId:stock?._id??'',
  codigoProduto:product?.codigoProduto??null,codigoInsumo:stock?.codigoInsumo??null,
  productUpdatedAt:product?.updatedAt??null,stockUpdatedAt:stock?.updatedAt??null,
  fornecedoresIds:stock?.fornecedoresIds??[],componentes:product?.componentes??[],
  ativo:source.ativo,_product:product,_stock:stock};
}
export function catalogue(products,stocks){
 const byStock=new Map(stocks.map(stock=>[stock._id,stock]));
 const linked=new Set(products.map(product=>product.stockItemId).filter(Boolean));
 return [...products.map(product=>registeredItem(product,byStock.get(product.stockItemId))),
  ...stocks.filter(stock=>!linked.has(stock._id)).map(stock=>registeredItem(null,stock))];
}
export function registrationPayload(body){
 if(typeof body.produto!=='boolean'||typeof body.insumo!=='boolean'||!body.produto&&!body.insumo)throw new Error('Marque Produto, Insumo ou ambos.');
 return {p_request:body.requestId,p_product:body.codigoProduto??null,p_stock:body.codigoInsumo??null,
  p_data:{produto:body.produto,insumo:body.insumo,supply_mode:body.abastecimento??'DIRECT',
   product:body.produto?productToRow(body):{},stock:body.insumo?stockToRow(body):{},
   components:body.produto&&!body.insumo?componentsToRows(body.componentes??[]):[],
   suppliers:(body.fornecedoresIds??[]).filter(Boolean),
   product_updated_at:body.productUpdatedAt??null,stock_updated_at:body.stockUpdatedAt??null}};
}
export function registrationResult(data){
 return registeredItem(data.product?productFromRow(data.product):null,data.stock?stockFromRow(data.stock):null);
}
