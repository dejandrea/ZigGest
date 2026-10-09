import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Clientes from './pages/Clientes';
import Fornecedores from './pages/Fornecedores';
import Contas from './pages/Contas';
import ResumoContas from './pages/ResumoContas';
import Mesas from './pages/Mesas';
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
      <Route path="/contas" element={<Contas/>}/>
      <Route path="/resumo" element={<ResumoContas/>}/>
      <Route path="/mesas" element={<Mesas/>}/>
      <Route element={<ProtectedRoute admin/>}><Route path="/usuarios" element={<Users/>}/></Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>;
}
