import MoneyInput from './MoneyInput';
import React, { useState, useEffect } from 'react';
import useOperation from '../hooks/useOperation';
import api from '../services/api.js';
import '../styles/components/Modal.css';

import Botao from './Botao';

const ModalEditarConta = ({ conta, onClose, onSuccess }) => {
    const {error,busy,run}=useOperation();
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
                const res = await run(() => api.get('/clientes'));
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
            setValor(String(conta.valor));
            setVencimento(conta.dataVencimento?.slice(0, 10));
            setTipo(conta.tipo);
            setObservacoes(conta.observacoes || '');
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
        const valorFormatado = valorDigitado;
        setValor(valorFormatado);
    };


    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!clienteSelecionado) return alert("Selecione um cliente");
        if (!tipo) return alert("Selecione o tipo da conta");

        // const valorNumerico = parseFloat(valor.replace(/\D/g, '')) / 100;
        const valorNumerico = valor;


        const contaAtualizada = {
            codigoCliente: clienteSelecionado.codigoCliente,
            valor: valorNumerico,
            dataVencimento: vencimento,
            tipo,
            observacoes: observacoes
        };

        try {
            await run(() => api.put(`/contas/${conta.codigoConta}`, contaAtualizada));
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Erro ao atualizar conta:', err);
        }
    };


    const excluir = async () => {
        if (!window.confirm('Excluir este registro? Esta operacao nao pode ser desfeita.')) return;
        try {
            await run(() => api.delete('/contas/' + conta.codigoConta));
            onSuccess(); onClose();
        } catch { /* Error is displayed by useOperation. */ }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                {error && <p role="alert">{error}</p>}
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
                    <MoneyInput
                        type="number" min="0.000001" step="0.000001"
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
                        <Botao disabled={busy} tamanho='xxsm' cor='terciario' onClick={excluir}>Excluir</Botao>
                        <Botao tipo="submit" disabled={busy} tamanho="xxsm" cor="terciario">Salvar</Botao>
                        <Botao tamanho="xxsm" cor="terciario" onClick={onClose}>Cancelar</Botao>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ModalEditarConta;
