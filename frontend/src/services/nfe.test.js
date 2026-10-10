import {describe,it,expect} from 'vitest';
import {parseNfe,validInvoiceKey,readNfeFile,MAX_NFE_BYTES} from './nfe';
import {nfeXml,makeKey} from '../testFixtures/nfe';
describe('NF-e XML import',()=>{
 it('extracts complete invoice metadata and preserves original decimal quantities',()=>{
  const invoice=parseNfe(nfeXml());
  expect(invoice).toMatchObject({key:makeKey(),number:'1',issuerName:'Fornecedor & Bebidas',recipientDocument:'98765432000100',total:'96.00'});
  expect(invoice.items[0]).toMatchObject({line:1,quantity:'2.0000',unit:'PCT',taxQuantity:'24.0000',ncm:'22021000'});
 });
 it('accepts namespace prefixes and checks the access key digit',()=>{
  const xml=nfeXml().replace('xmlns=', 'xmlns:n=').replace(/<(\/?)(\w+)(?=[\s>])/g,'<$1n:$2');
  expect(parseNfe(xml).items).toHaveLength(1);
  expect(validInvoiceKey(makeKey())).toBe(true);
  expect(validInvoiceKey(makeKey().slice(0,-1)+(makeKey().endsWith('0')?'1':'0'))).toBe(false);
 });
 it.each([
  ['malformed','<broken>'],
  ['entities','<!DOCTYPE nfeProc [<!ENTITY x "bad">]>'+nfeXml()],
  ['missing protocol',nfeXml().replace(/<protNFe>.*<\/protNFe>/,'')],
  ['denied',nfeXml({status:'110'})],
  ['homologation',nfeXml({environment:'2'})],
  ['duplicate item',nfeXml({items:2}).replace('nItem="2"','nItem="1"')],
  ['invalid quantity',nfeXml({quantity:'-2'})],
 ])('rejects %s before showing a preview',(_name,xml)=>expect(()=>parseNfe(xml)).toThrow());
 it('reads the file and limits oversized uploads',async()=>{
  const xml=nfeXml(),bytes=new TextEncoder().encode(xml);
  expect((await readNfeFile({size:bytes.length,arrayBuffer:async()=>bytes.buffer})).invoice.key).toBe(makeKey());
  await expect(readNfeFile({size:MAX_NFE_BYTES+1})).rejects.toThrow('2 MB');
 });
});
