import React from 'react';
import {it,expect} from 'vitest';
import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import ReportComingSoon from './ReportComingSoon';
import Relatorios from './Relatorios';
it('has report options for the operation log and invoice status',()=>{
 render(<MemoryRouter><Relatorios/></MemoryRouter>);
 expect(screen.getByRole('link',{name:'Ver registros de operações'})).toHaveAttribute('href','/relatorios/logs');
 expect(screen.getByRole('link',{name:'Ver vendas e notas fiscais'})).toHaveAttribute('href','/relatorios/vendas-notas');
});
it('shows the report placeholder',()=>{
 render(<MemoryRouter><ReportComingSoon title="Registros de operações" description="Histórico"/></MemoryRouter>);
 expect(screen.getByRole('heading',{name:'Registros de operações'})).toBeInTheDocument();
 expect(screen.getByRole('status')).toHaveTextContent('Em breve');
});
