import React, { useState } from 'react';
import axios from 'axios';
import api from '../services/api';
import Botao from './Botao';
import '../styles/components/Modal.css';

const ModalNovoCliente = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({
    nome: '',
    apelido: '',
    telefone: '',
    email: '',
    endereco: '',
    status: "liberado",
    limite:100,
    observacoes: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
  
    const cliente = {
      ...form,
      apelido: form.apelido.trim() === '' ? form.nome : form.apelido,
    };
  
    try {
      await api.post('/clientes', cliente);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao cadastrar cliente:', error);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Novo Cliente</h2>
        <form onSubmit={handleSubmit}>
          <input name="nome" placeholder="Nome" value={form.nome} onChange={handleChange} required autoFocus />
          <input name="apelido" placeholder="Apelido" value={form.apelido} onChange={handleChange} />
          <input name="telefone" placeholder="Telefone" value={form.telefone} onChange={handleChange} />
          <input name="email" placeholder="Email" value={form.email} onChange={handleChange} />
          <input name="endereco" placeholder="Endereço" value={form.endereco} onChange={handleChange} />
          <label>Status:</label>
          <select name="status" value={form.status} onChange={handleChange}>
            <option value="bloqueado">Bloqueado</option>
            <option value="liberado">Liberado</option>
          </select>
          <label>Limite:</label>
          <input name="limite" placeholder="Limite" value={form.limite} onChange={handleChange} />
          <textarea name="observacoes" placeholder="Observações" value={form.observacoes} onChange={handleChange} />
          <div className="modal-buttons">
            <Botao tipo='submit' tamanho='xxsm' cor='terciario'>Salvar</Botao>
            <Botao tamanho='xxsm' cor='terciario'onClick={onClose}>Cancelar</Botao>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalNovoCliente;
