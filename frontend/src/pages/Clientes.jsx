import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../services/api';
import Botao from '../components/Botao';
import Header from "../components/Header"
import ModalNovoCliente from '../components/ModalNovoCliente';
import ModalEditarCliente from '../components/ModalEditarCliente';
import "../styles/pages/Clientes.css"

const Clientes = () => {
    const [clientes, setClientes] = useState([]);
    const [mostrarModal, setMostrarModal] = useState(false);
    const [clienteSelecionado, setClienteSelecionado] = useState(null);
    const [clientesFiltrados, setClientesFiltrados] = useState([]);
    const [busca, setBusca] = useState('');

    let navigate = useNavigate();
    const fetchClientes = async () => {
        try {
            const response = await api.get('/clientes');
            setClientes(response.data);
            setClientesFiltrados(response.data);
        } catch (error) {
            console.error('Erro ao buscar clientes', error);
        }
    };

    useEffect(() => {
        fetchClientes();
    }, []);

    // Filtro em tempo real
    useEffect(() => {
        const filtro = clientes.filter(c =>
            c.nome.toLowerCase().includes(busca.toLowerCase()) ||
            c.apelido.toLowerCase().includes(busca.toLowerCase()) ||
            String(c.codigoCliente).includes(busca)
        );
        setClientesFiltrados(filtro);
    }, [busca, clientes]);

    return (
        <div className="body">
            <Header />
            <h1>Clientes</h1>
            <div className='body__top'>
                <div className="menu">
                    <Botao onClick={() => navigate('/')} tamanho='xsm'>Tela Inicial</Botao>
                    <Botao onClick={() => navigate('/contas')} tamanho='xsm'>Contas</Botao>
                    <Botao onClick={() => navigate('/resumo')} tamanho='xsm'>Relatórios</Botao>
                    <Botao onClick={() => setMostrarModal(true)} tamanho='sm'>Novo Cliente</Botao>
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
                            <th>Nome</th>
                            <th>Apelido</th>
                            <th>Status</th>
                            <th>Observações</th>
                            <th>Editar</th>
                        </tr>
                        {clientesFiltrados.map((cliente) => (
                            <tr key={cliente.codigoCliente} className={`${cliente.status} ${cliente.ativo ? "ativo" : "inativo"}`}>
                                <td>{cliente.codigoCliente}</td>
                                <td>{cliente.nome}</td>
                                <td>{cliente.apelido}</td>
                                <td>{cliente.status}</td>
                                <td>{cliente.observacoes}</td>
                                <td onClick={() => setClienteSelecionado(cliente)} className='editar'>Editar</td>
                            </tr>
                        ))}
                    </table>
                    {clienteSelecionado && (
                        <ModalEditarCliente
                            cliente={clienteSelecionado}
                            onClose={() => setClienteSelecionado(null)}
                            onSuccess={() => {
                                setClienteSelecionado(null);
                                // atualiza a lista
                                fetchClientes();
                            }}
                        />
                    )}
                </div>
            </div>

            {mostrarModal && (
                <ModalNovoCliente
                    onClose={() => setMostrarModal(false)}
                    onSuccess={() => {
                        setMostrarModal(false);
                        api.get('/clientes')
                            .then(res => setClientes(res.data));
                    }}
                />
            )}
        </div>


    );

};

export default Clientes;