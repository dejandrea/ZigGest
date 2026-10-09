import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../services/api';
import Botao from './Botao';
import '../styles/components/Modal.css';

const ModalEditarCliente = ({ cliente, onClose, onSuccess }) => {
    const [form, setForm] = useState(cliente);

    useEffect(() => {
        setForm(cliente); // Atualiza se cliente mudar
    }, [cliente]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const clienteAtualizado = {
            ...form,
            apelido: form.apelido.trim() === '' ? form.nome : form.apelido,
        };

        try {
            await api.put(`/clientes/${form.codigoCliente}`, clienteAtualizado);
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Erro ao atualizar cliente:', error);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>Editar Cliente</h2>
                <form onSubmit={handleSubmit}>
                    <label>Nome:</label>
                    <input name="nome" value={form.nome} onChange={handleChange} required />
                    <label>Apelido:</label>
                    <input name="apelido" value={form.apelido} onChange={handleChange} />
                    <label>Telefone:</label>
                    <input name="telefone" value={form.telefone} onChange={handleChange} />
                    <label>Email:</label>
                    <input name="email" value={form.email} onChange={handleChange} />
                    <label>Endereço:</label>
                    <input name="endereco" value={form.endereco} onChange={handleChange} />
                    <label>Status:</label>
                    <select name="status" value={form.status} onChange={handleChange}>
                        <option value="liberado">Liberado</option>
                        <option value="bloqueado">Bloqueado</option>
                    </select>
                    <label>Ativo:</label>
                    <select name="ativo" value={form.ativo} onChange={handleChange}>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                    </select>
                    <label>Limite:</label>
                    <input name="limite" value={form.limite} onChange={handleChange} />
                    <label>Observações:</label>
                    <textarea name="observacoes" value={form.observacoes} onChange={handleChange} />
                    <div className="modal-buttons">
                        <Botao tipo='submit' tamanho='xxsm' cor='terciario'>Salvar</Botao>
                        <Botao tamanho='xxsm' cor='terciario' onClick={onClose}>Cancelar</Botao>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ModalEditarCliente;
