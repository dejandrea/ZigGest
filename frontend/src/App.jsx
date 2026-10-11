import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import FinancialSettings from './pages/FinancialSettings';
import FinancialMovements from './pages/FinancialMovements';
import Home from './pages/Home';
import Clientes from './pages/Clientes';
import Fornecedores from './pages/Fornecedores';
import Produtos from './pages/Produtos';
import Insumos from './pages/Insumos';
import MovimentacoesEstoque from './pages/MovimentacoesEstoque';
import ContasPagar from './pages/ContasPagar';
import Contas from './pages/Contas';
import ResumoContas from './pages/ResumoContas';
import Relatorios from './pages/Relatorios';
import ReportComingSoon from './pages/ReportComingSoon';
import RelatorioEstoque from './pages/RelatorioEstoque';
import Inventario from './pages/Inventario';
import Comandas from './pages/Comandas';
import Caixa from './pages/Caixa';
import Compras from './pages/Compras';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Users from './pages/Users';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './auth/ProtectedRoute';
import './App.css';

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login/>}/>
    <Route path="/alterar-senha" element={<ChangePassword/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route element={<AppLayout/>}>
      <Route path="/" element={<Home/>}/>
      <Route path="/clientes" element={<Clientes/>}/>
      <Route path="/fornecedores" element={<Fornecedores/>}/>
      <Route path="/produtos" element={<Produtos/>}/>
      <Route path="/insumos" element={<Insumos/>}/>
      <Route path="/estoque" element={<Insumos overview/>}/>
      <Route path="/estoque/movimentacoes" element={<MovimentacoesEstoque/>}/>
      <Route path="/estoque/inventario" element={<Inventario/>}/>
      <Route path="/financeiro" element={<FinancialMovements/>}/>
      <Route element={<ProtectedRoute admin/>}><Route path="/financeiro/configuracoes" element={<FinancialSettings/>}/></Route>
      <Route path="/contas-pagar" element={<ContasPagar/>}/>
      <Route path="/contas" element={<Contas/>}/>
      <Route path="/resumo" element={<ResumoContas/>}/>
      <Route path="/relatorios" element={<Relatorios/>}/>
      <Route path="/relatorios/financeiro" element={<ResumoContas report/>}/>
      <Route path="/relatorios/estoque" element={<RelatorioEstoque/>}/>
      <Route path="/relatorios/logs" element={<ReportComingSoon title="Registros de operações" description="Histórico de ações, responsáveis e alterações no sistema."/>}/>
      <Route path="/relatorios/vendas-notas" element={<ReportComingSoon title="Vendas e notas fiscais" description="Vendas com nota fiscal gerada e sem nota fiscal gerada."/>}/>
      <Route path="/comandas" element={<Comandas/>}/>
      <Route path="/pdv" element={<Comandas pdv/>}/>
      <Route path="/caixa" element={<Caixa/>}/>
      <Route path="/compras" element={<Compras/>}/>
      <Route path="/mesas" element={<Navigate to="/comandas" replace/>}/>
      <Route element={<ProtectedRoute admin/>}><Route path="/usuarios" element={<Users/>}/></Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>;
}
