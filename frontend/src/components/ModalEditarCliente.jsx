import React, { useState, useEffect } from 'react';
import useOperation from '../hooks/useOperation';
import api from '../services/api';
import Botao from './Botao';
import FormModal,{useFormClose} from './FormModal';
import '../styles/components/Modal.css';

const ModalEditarCliente = ({ cliente, onClose, onSuccess }) => {
    const {error,busy,run}=useOperation();
    const [form, setForm] = useState(cliente);

    useEffect(() => {
        setForm(cliente); // Atualiza se cliente mudar
    }, [cliente]);

    const dirty=JSON.stringify(form)!==JSON.stringify(cliente);
    const requestClose=useFormClose(onClose,dirty,busy);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const clienteAtualizado = {
            ...form,
            apelido: (form.apelido || '').trim() === '' ? form.nome : form.apelido,
        };

        try {
            await run(() => api.put(`/clientes/${form.codigoCliente}`, clienteAtualizado));
            onSuccess('Cadastro atualizado com sucesso.');
            onClose();
        } catch (error) {
            console.error('Erro ao atualizar cliente:', error);
        }
    };


    const excluir = async () => {
        if (!window.confirm('Excluir este registro? Esta operacao nao pode ser desfeita.')) return;
        try {
            await run(() => api.delete('/clientes/' + cliente.codigoCliente));
            onSuccess('Cliente excluido com sucesso.'); onClose();
        } catch { /* Error is displayed by useOperation. */ }
    };

    return (
        <FormModal labelledBy="ModalEditarCliente-title" onClose={requestClose} dirty={dirty} busy={busy}>
            <div className="modal">
                {error && <p role="alert">{error}</p>}
                <h2 id="ModalEditarCliente-title">Editar Cliente</h2>
                <form onSubmit={handleSubmit}><fieldset disabled={busy} className="legacy-modal-fields">
                    <label>Nome<input name="nome" aria-label="Nome" value={form.nome} onChange={handleChange} required /></label>
                    <label>Apelido<input name="apelido" aria-label="Apelido" value={form.apelido} onChange={handleChange} /></label>
                    <label>Telefone<input name="telefone" aria-label="Telefone" value={form.telefone} onChange={handleChange} /></label>
                    <label>E-mail<input type="email" name="email" aria-label="E-mail" value={form.email} onChange={handleChange} /></label>
                    <label>Endereço<input name="endereco" aria-label="Endereco" value={form.endereco} onChange={handleChange} /></label>
                    <label>Status financeiro<select name="status" aria-label="Status financeiro" value={form.status} onChange={handleChange}>
                        <option value="liberado">Liberado</option>
                        <option value="bloqueado">Bloqueado</option>
                    </select></label>
                    <label>Situação do cadastro<select name="ativo" aria-label="Cadastro ativo" value={form.ativo} onChange={handleChange}>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                    </select></label>
                    <label>Limite<input type="number" min="0" step="0.01" name="limite" aria-label="Limite" value={form.limite} onChange={handleChange} /></label>
                    <label>Observações<textarea name="observacoes" aria-label="Observacoes" value={form.observacoes} onChange={handleChange} /></label>
                    <div className="modal-buttons">
                        <Botao disabled={busy} tamanho='xxsm' cor='terciario' onClick={excluir}>Excluir</Botao>
                        <Botao tipo='submit' disabled={busy} tamanho='xxsm' cor='terciario'>Salvar</Botao>
                        <Botao tamanho='xxsm' cor='terciario' onClick={requestClose}>Cancelar</Botao>
                    </div>
                </fieldset></form>
            </div>
        </FormModal>
    );
};

export default ModalEditarCliente;
