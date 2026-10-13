import {cents} from './payables';
export function cashChange(value,received){const paid=cents(value),tendered=cents(received===''||received==null?value:received);if(tendered<paid)throw new Error('O dinheiro recebido deve cobrir o valor do pagamento.');return (tendered-paid)/100;}
export function adjustedTotal(subtotal,discount,surcharge,paid=0){const total=cents(subtotal)-cents(discount||0)+cents(surcharge||0);if(total<cents(paid))throw new Error('O total ajustado não pode ficar abaixo do valor já pago.');return total/100;}
