import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../services/api.js';
import '../styles/components/Modal.css';
import { formatarMoedaDigitada, formatarMoedaBanco, desformatarMoeda } from '../utils/formatacao.js';
import Botao from './Botao';

const ModalEditarConta = ({ conta, onClose, onSuccess }) => {
    const [clientes, setClientes] = useState([]);
    const [filtro, setFiltro] = useState('');
    const [clienteSelecionado, setClienteSelecionado] = useState(null);
    const [valor, setValor] = useState('');
    const [vencimento, setVencimento] = useState('');
    const [tipo, setTipo] = useState('');
    const [observacoes, setObservacoes] = useState('');

    useEffect(() => {
        const buscarClientes = async () => {
            try {
                const res = await api.get('/clientes');
                setClientes(res.data);
            } catch (err) {
                console.error('Erro ao buscar clientes', err);
            }
        };

        buscarClientes();

        if (conta) {
            // Atribuindo os valores de conta para o estado
            setClienteSelecionado({
                nome: conta.clienteNome,  // Atribuindo o nome do cliente corretamente
                codigoCliente: conta.codigoCliente
            });
            setFiltro(conta.clienteNome);  // Preenchendo o filtro com o nome do cliente
            setValor(formatarMoedaBanco(conta.valor));
            setVencimento(conta.dataVencimento?.slice(0, 10));
            setTipo(conta.tipo);
            setObservacoes(conta.Observacao || '');
        }
    }, [conta]);


    const clientesFiltrados = clientes.filter((c) =>
        c.ativo &&
        (
            (c.nome && c.nome.toLowerCase().includes(filtro?.toLowerCase() || '')) ||
            (c.apelido && c.apelido.toLowerCase().includes(filtro?.toLowerCase() || '')) ||
            c.codigoCliente.toString().includes(filtro || '')
        )
    );


    const handleValorChange = (e) => {
        const valorDigitado = e.target.value;
        const valorFormatado = formatarMoedaDigitada(valorDigitado);
        setValor(valorFormatado);
    };


    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!clienteSelecionado) return alert("Selecione um cliente");
        if (!tipo) return alert("Selecione o tipo da conta");

        // const valorNumerico = parseFloat(valor.replace(/\D/g, '')) / 100;
        const valorNumerico = desformatarMoeda(valor);


        const contaAtualizada = {
            codigoCliente: clienteSelecionado.codigoCliente,
            valor: valorNumerico,
            dataVencimento: vencimento,
            tipo,
            Observacao: observacoes
        };

        try {
            await api.put(`/contas/${conta.codigoConta}`, contaAtualizada);
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Erro ao atualizar conta:', err);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <form onSubmit={handleSubmit}>
                    <h2>Editar Conta</h2>

                    <label>Cliente:</label>
                    <input
                        type="text"
                        value={clienteSelecionado ? clienteSelecionado.nome : filtro}
                        onChange={(e) => {
                            setFiltro(e.target.value);
                            setClienteSelecionado(null);
                        }}
                        placeholder="Digite o nome do cliente"
                    />
                    {filtro && !clienteSelecionado && clientesFiltrados.length > 0 && (
                        <ul className="sugestoes">
                            {clientesFiltrados.map((cliente) => (
                                <li
                                    key={cliente.codigoCliente}
                                    onMouseDown={() => {
                                        setClienteSelecionado(cliente);
                                        setFiltro(cliente.nome);
                                    }}
                                >
                                    {cliente.nome} - {cliente.apelido} - ({cliente.codigoCliente})
                                </li>
                            ))}
                        </ul>
                    )}

                    {clienteSelecionado && (
                        <p>Cliente selecionado: {clienteSelecionado.nome}</p>
                    )}

                    <label>Tipo de Conta:</label>
                    <select value={tipo} onChange={(e) => setTipo(e.target.value)} required>
                        <option value="">Selecione...</option>
                        <option value="credito">Crédito</option>
                        <option value="debito">Débito</option>
                    </select>

                    <label>Valor:</label>
                    <input
                        type="text"
                        placeholder="Valor"
                        value={valor}
                        onChange={handleValorChange}
                        required
                    />

                    <label>Data de Vencimento:</label>
                    <input
                        type="date"
                        value={vencimento}
                        onChange={(e) => setVencimento(e.target.value)}
                        required
                    />

                    <label>Observações:</label>
                    <textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        rows={3}
                    />

                    <div className="modal-buttons">
                        <Botao tipo="submit" tamanho="xxsm" cor="terciario">Salvar</Botao>
                        <Botao tamanho="xxsm" cor="terciario" onClick={onClose}>Cancelar</Botao>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ModalEditarConta;
