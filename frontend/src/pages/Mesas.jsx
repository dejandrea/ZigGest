import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../services/api';
import MesaCard from '../components/MesaCard';
import ModalNovaMesa from '../components/ModalNovaMesa';
import ModalDetalhesMesa from '../components/ModalDetalhesMesa';
import Header from '../components/Header';
import Botao from '../components/Botao';
import '../styles/pages/Mesas.css';

const Mesas = () => {
    const [mesas, setMesas] = useState([]);
    const [mesaSelecionada, setMesaSelecionada] = useState(null);
    const [mostrarModalNova, setMostrarModalNova] = useState(false);
    const [mostrarDetalhes, setMostrarDetalhes] = useState(false);

    let navigate = useNavigate();

    const buscarMesas = async () => {
        try {
            const { data } = await api.get('/mesas');
            setMesas(data);
        } catch (err) {
            console.error('Erro ao buscar mesas', err);
        }
    };

    useEffect(() => {
        buscarMesas();
    }, []);

    return (
        <div className="body">
            <Header />
            <h1>Mesas</h1>
            <div className="body__top">
                <div className="menu">
                    <Botao onClick={() => navigate('/')} tamanho='xsm'>Tela Inicial</Botao>
                    <Botao onClick={() => navigate('/clientes')} tamanho='xsm'>Clientes</Botao>
                    <Botao onClick={() => navigate('/contas')} tamanho='xsm'>Contas</Botao>
                    <Botao onClick={() => setMostrarModalNova(true)} tamanho='sm'>Nova Mesa</Botao>
                </div>
            </div>

            <div>
                {mesas.map(mesa => (
                    <MesaCard
                        key={mesa.codigoMesa}
                        mesa={mesa}
                        onClick={() => {
                            setMesaSelecionada(mesa);
                            setMostrarDetalhes(true);
                        }}
                    />
                ))}
            </div>

            {mostrarModalNova && (
                <ModalNovaMesa
                    onClose={() => {
                        setMostrarModalNova(false);
                        buscarMesas();
                    }}
                />
            )}

            {mostrarDetalhes && mesaSelecionada && (
                <ModalDetalhesMesa
                    mesa={mesaSelecionada}
                    onClose={() => {
                        setMostrarDetalhes(false);
                        buscarMesas();
                    }}
                />
            )}
        </div>
    );
};

export default Mesas;
