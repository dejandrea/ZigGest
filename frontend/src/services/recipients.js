import {supplierFromRow,supplierToRow} from './dataMapping';
export const documentDigits=value=>String(value??'').replace(/\D/g,'');
export function recipientFromRow(row){const mapped=supplierFromRow(row);delete mapped.codigoFornecedor;return {...mapped,codigoDestinatario:row.codigo_destinatario};}
export function recipientToRow(body){const row=supplierToRow(body);if(row.documento!==undefined){row.documento=documentDigits(row.documento);if(!/^(\d{11}|\d{14})$/.test(row.documento))throw new Error('Informe CPF ou CNPJ completo do destinatário.');}return row;}
export function matchInvoiceParty(rows,document){const digits=documentDigits(document);return /^(\d{11}|\d{14})$/.test(digits)?rows.find(row=>documentDigits(row.documento)===digits):undefined;}
export function matchInvoiceName(rows,name){const matches=rows.filter(row=>row.ativo&&row.nome.toLocaleLowerCase('pt-BR')===name.trim().toLocaleLowerCase('pt-BR'));return matches.length===1?matches[0]:undefined;}
