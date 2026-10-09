import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Botao from '../components/Botao';
import '../styles/pages/Home.css';

const Home = () => {
  let navigate = useNavigate();
  return (
    <div className="body">
      <Header />
      <div>
        <Botao onClick={() => navigate('/clientes')}>Clientes</Botao>
        <Botao onClick={() => navigate('/contas')}>À Receber</Botao>
      </div>
      <div>
        <Botao onClick={() => navigate('/resumo')}>Relatórios</Botao>
        {/* <Botao onClick={() => navigate('/mesas')}>Mesas</Botao> */}
      </div>
    </div>
  );
}

export default Home;