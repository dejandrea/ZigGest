import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import axios from 'axios';
import api from '../services/api';
import Botao from '../components/Botao';
import Header from "../components/Header"
import ModalNovaConta from '../components/ModalNovaConta';
import ModalEditarConta from '../components/ModalEditarConta';
import "../styles/pages/Contas.css"

const Contas = () => {
    const [contas, setContas] = useState([]);
    const [mostrarModalConta, setMostrarModalConta] = useState(false);
    const [contaSelecionada, setContaSelecionada] = useState(null);
    const [clientesFiltrados, setClientesFiltrados] = useState([]);
    const [busca, setBusca] = useState('');

    let navigate = useNavigate();

    const formatarData = (dataISO) => {
        return format(new Date(dataISO), "dd/MM/yyyy", { locale: ptBR });
    };

    const formatarValor = (valor) => {
        return valor.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    };

    // Filtro em tempo real
    useEffect(() => {
        const filtro = contas.filter(c =>
            c.clienteNome.toLowerCase().includes(busca.toLowerCase()) ||
            String(c.codigoCliente).includes(busca)
        );
        setClientesFiltrados(filtro);
    }, [busca, contas]);

    const fetchContas = async () => {
        try {
            const response = await api.get('/contas');
            setContas(response.data);
        } catch (error) {
            console.error('Erro ao buscar contas', error);
        }
    };

    useEffect(() => {
        fetchContas();
    }, []);

    return (
        <div className="body">
            <Header />
            <h1>Contas</h1>
            <div className='body__top'>
                <div className="menu">
                    <Botao onClick={() => navigate('/')} tamanho='xsm'>Tela Inicial</Botao>
                    <Botao onClick={() => navigate('/clientes')} tamanho='xsm'>Clientes</Botao>
                    <Botao onClick={() => navigate('/resumo')} tamanho='xsm'>Relatórios</Botao>
                    <Botao onClick={() => setMostrarModalConta(true)} tamanho='sm'>Nova Conta</Botao>
                </div>

                <input
                    type="text"
                    placeholder="Buscar por nome, apelido ou código"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className='searchInput'
                />
            </div>
            <div className="body-content">

                <div className='main-content'>
                    <table>
                        <tr className='table__title'>
                            <th>Cód</th>
                            <th colSpan={2}>Cliente</th>
                            <th>Valor</th>
                            <th>Vencimento</th>
                            <th>Tipo</th>
                            <th>Editar</th>
                        </tr>
                        {clientesFiltrados.length > 0 ? (
                                clientesFiltrados.map((conta) => (
                                    <tr key={conta.codigoConta} className={`${conta.tipo}`}>
                                        <td>{conta.codigoConta}</td>
                                        <td>{conta.codigoCliente}</td>
                                        <td>{conta.clienteNome}</td>
                                        <td>{formatarValor(conta.valor)}</td>
                                        <td>{formatarData(conta.dataVencimento)}</td>
                                        <td>{conta.tipo}</td>
                                        <td
                                            className='editar'
                                            onClick={() => setContaSelecionada(conta)}
                                        >Editar</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7}>Nenhuma conta encontrada</td>
                                </tr>
                            )}
                    </table>

                </div>
            </div>

            {mostrarModalConta && (
                <ModalNovaConta
                    onClose={() => setMostrarModalConta(false)}
                    onSuccess={() => {
                        setMostrarModalConta(false);
                        fetchContas(); // função que recarrega as contas
                    }}
                />
            )}
            {contaSelecionada && (
                <ModalEditarConta
                    conta={contaSelecionada}
                    onClose={() => setContaSelecionada(null)}
                    onSuccess={() => {
                        setContaSelecionada(null);
                        fetchContas();
                    }}
                />
            )}
        </div>
    );
};

export default Contas;