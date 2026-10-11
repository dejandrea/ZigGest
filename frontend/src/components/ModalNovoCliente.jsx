import ContactInput from './ContactInput';
import SaveAndContinue,{continuesRegistration,focusRegistration} from './SaveAndContinue';
import React, { useState } from 'react';
import useOperation from '../hooks/useOperation';
import api from '../services/api';
import Botao from './Botao';
import FormModal,{useFormClose} from './FormModal';
import '../styles/components/Modal.css';

const ModalNovoCliente = ({ onClose, onSuccess, initialName='' }) => {
    const {error,busy,run}=useOperation();
  const [form, setForm] = useState({
    nome: initialName,
    apelido: '',
    telefone: '',
    email: '',
    endereco: '',
    status: "liberado",
    limite:100,
    observacoes: ''
  });

  const dirty=!!(form.nome||form.apelido||form.telefone||form.email||form.endereco||form.observacoes)||form.status!=='liberado'||Number(form.limite)!==100;
  const requestClose=useFormClose(onClose,dirty,busy);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();const keepOpen=continuesRegistration(e),target=e.currentTarget;
  
    const cliente = {
      ...form,
      ativo: true,
      apelido: (form.apelido || '').trim() === '' ? form.nome : form.apelido,
    };
  
    try {
      const {data}=await run(() => api.post('/clientes', cliente));
      if(keepOpen){setForm({nome:'',apelido:'',telefone:'',email:'',endereco:'',status:'liberado',limite:100,observacoes:''});focusRegistration({currentTarget:target});}
      onSuccess?.(data,keepOpen);
      if(!keepOpen)onClose();
    } catch (error) {
      console.error('Erro ao cadastrar cliente:', error);
    }
  };

  return (
    <FormModal labelledBy="ModalNovoCliente-title" onClose={requestClose} dirty={dirty} busy={busy}>
      <div className="modal">
                {error && <p role="alert">{error}</p>}
        <h2 id="ModalNovoCliente-title">Novo Cliente</h2>
        <form onSubmit={handleSubmit}><fieldset disabled={busy} className="legacy-modal-fields">
          <label>Nome<input name="nome" aria-label="Nome" placeholder="Nome" value={form.nome} onChange={handleChange} required autoFocus /></label>
          <label>Apelido<input name="apelido" aria-label="Apelido" placeholder="Apelido" value={form.apelido} onChange={handleChange} /></label>
          <label>Telefone<ContactInput kind="phone" name="telefone" aria-label="Telefone" placeholder="Telefone" value={form.telefone} onChange={handleChange} /></label>
          <label>E-mail<input type="email" name="email" aria-label="E-mail" placeholder="Email" value={form.email} onChange={handleChange} /></label>
          <label>Endereço<input name="endereco" aria-label="Endereco" placeholder="Endereço" value={form.endereco} onChange={handleChange} /></label>
          <label>Status financeiro<select name="status" aria-label="Status financeiro" value={form.status} onChange={handleChange}>
            <option value="bloqueado">Bloqueado</option>
            <option value="liberado">Liberado</option>
          </select></label>
          <label>Limite<input type="number" min="0" step="0.01" name="limite" aria-label="Limite" placeholder="Limite" value={form.limite} onChange={handleChange} /></label>
          <label>Observações<textarea name="observacoes" aria-label="Observacoes" placeholder="Observações" value={form.observacoes} onChange={handleChange} /></label>
          <div className="modal-buttons">
            <Botao tipo='submit' disabled={busy} tamanho='xxsm' cor='terciario'>Salvar</Botao><SaveAndContinue disabled={busy}/>
            <Botao tamanho='xxsm' cor='terciario'onClick={requestClose}>Cancelar</Botao>
          </div>
        </fieldset></form>
      </div>
    </FormModal>
  );
};

export default ModalNovoCliente;
