import {it,expect} from 'vitest';
import {invoiceTotals} from './invoiceTotals';
it('sums money in cents without floating point differences',()=>{
 expect(invoiceTotals('0.30',[{total:'0.10'},{total:'0.20'}])).toEqual({sum:'0.30',calculated:'0.30',difference:'0.00',matches:true});
 expect(invoiceTotals('100',[{total:'96'},{total:'2.50'}])).toEqual({sum:'98.50',calculated:'98.50',difference:'1.50',matches:false});
 expect(invoiceTotals('90',[{total:'96'}]).difference).toBe('-6.00');
});
it('recomputes after item changes and does not treat missing or invalid values as zero',()=>{
 expect(invoiceTotals('96',[{total:'96'},{total:'48'}]).sum).toBe('144.00');
 expect(invoiceTotals('96',[{total:'96'}]).matches).toBe(true);
 expect(invoiceTotals('',[{total:'96'}])).toEqual({sum:'96.00',calculated:'96.00',difference:'',matches:null});
 expect(invoiceTotals('96',[{total:''}]).matches).toBe(null);
 expect(invoiceTotals('96',[{total:'-1'}]).sum).toBe('');
});
it('reconciles freight, discounts, added taxes and surcharges exactly',()=>{
 expect(invoiceTotals('111.35',[{total:'100.00'}],{frete:'10',descontos:'3.50',impostos:'4.25',acrescimos:'0.60'})).toEqual({sum:'100.00',calculated:'111.35',difference:'0.00',matches:true});
 expect(invoiceTotals('100',[{total:'100'}],{frete:'-1'}).matches).toBe(null);
});
