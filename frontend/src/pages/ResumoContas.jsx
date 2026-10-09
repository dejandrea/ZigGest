import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import axios from 'axios';
import api from '../services/api';
import Botao from '../components/Botao';
import Header from "../components/Header"
import '../styles/pages/ResumoContas.css';

const ResumoContas = () => {
    const [contas, setContas] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [filtro, setFiltro] = useState('');
    const [clienteSelecionado, setClienteSelecionado] = useState(null);

    let navigate = useNavigate();

    useEffect(() => {
        carregarDados();
    }, [clienteSelecionado]);

    const carregarDados = async () => {
        try {
            const resClientes = await api.get('/clientes');
            setClientes(resClientes.data);

            const resContas = await api.get('/contas');
            const contasOrdenadas = resContas.data.sort((a, b) => new Date(a.dataLancamento) - new Date(b.dataLancamento));

            setContas(clienteSelecionado
                ? contasOrdenadas.filter(c => c.codigoCliente === clienteSelecionado.codigoCliente)
                : contasOrdenadas
            );
        } catch (err) {
            console.error("Erro ao carregar dados", err);
        }
    };

    const calcularTotal = () => {
        return contas.reduce((total, conta) => {
            const valor = Number(conta.valor);
            return conta.tipo === 'credito' ? total - valor : total + valor;
        }, 0);
    };

    const totalFormatado = calcularTotal().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const clientesFiltrados = clientes.filter(c =>
        (c.nome && c.nome.toLowerCase().includes(filtro.toLowerCase())) ||
        (c.apelido && c.apelido.toLowerCase().includes(filtro.toLowerCase())) ||
        c.codigoCliente.toString().includes(filtro)
    );

    return (
        <div className="body">
            <Header />
            <h1>Resumo Financeiro</h1>

            <div className='body__top'>
                <div className="menu">
                    <Botao onClick={() => navigate('/')} tamanho='xsm'>Tela Inicial</Botao>
                    <Botao onClick={() => navigate('/clientes')} tamanho='xsm'>Clientes</Botao>
                    <Botao onClick={() => navigate('/contas')} tamanho='xsm'>Contas</Botao>
                </div>


                <div className='search-container'>
                    <input
                        type="text"
                        value={clienteSelecionado ? clienteSelecionado.nome : filtro}
                        onChange={(e) => {
                            setFiltro(e.target.value);
                            setClienteSelecionado(null);
                        }}
                        className='searchInput'
                        placeholder="Digite o nome, apelido ou código"
                    />
                    {filtro && !clienteSelecionado && clientesFiltrados.length > 0 && (
                        <ul className="sugestoes">
                            {clientesFiltrados.map(cliente => (
                                <li key={cliente.codigoCliente} onMouseDown={() => {
                                    setClienteSelecionado(cliente);
                                    setFiltro(cliente.nome);
                                }}>
                                    {cliente.nome} - ({cliente.codigoCliente})
                                </li>
                            ))}
                        </ul>
                    )}

                    {clienteSelecionado && (
                        <p><strong>Cliente selecionado:</strong> {clienteSelecionado.nome}</p>
                    )}
                </div>

            </div>
            <div className="total-saldo">
                <h3>Total {clienteSelecionado ? 'do cliente' : 'geral'}: <span>{totalFormatado}</span></h3>
            </div>
            <div className="body-content">
                <div className='main-content'>
                    <table className="tabela-contas">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Nome</th>
                                <th>Data Lançamento</th>
                                <th>Data Vencimento</th>
                                <th>Tipo</th>
                                <th>Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {contas.map(conta => (
                                <tr key={conta.codigoConta} className={`${conta.tipo}`}>
                                    <td>{conta.codigoCliente}</td>
                                    <td>{conta.clienteNome}</td>
                                    <td>{new Date(conta.dataLancamento).toLocaleDateString()}</td>
                                    <td>{new Date(conta.dataVencimento).toLocaleDateString()}</td>
                                    <td>{conta.tipo}</td>
                                    <td>{Number(conta.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ResumoContas;
