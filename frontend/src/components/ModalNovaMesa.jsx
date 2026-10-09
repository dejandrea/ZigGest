import React, { useState } from 'react';
import useOperation from '../hooks/useOperation';
import api from '../services/api';
import Botao from './Botao';
import FormModal,{useFormClose} from './FormModal';
import '../styles/components/Modal.css'

const ModalNovaMesa = ({ onClose }) => {
    const {error,busy,run}=useOperation();
    const [nomeMesa, setNomeMesa] = useState('');

    const dirty=nomeMesa!=='';
    const requestClose=useFormClose(onClose,dirty,busy);

    const criarMesa = async () => {
        try {
            await run(() => api.post('/mesas', { nomeMesa }));
            onClose();
        } catch (err) {
            console.error('Erro ao criar mesa', err);
        }
    };

    return (
        <FormModal labelledBy="ModalNovaMesa-title" onClose={requestClose} dirty={dirty} busy={busy}>
            <div className="modal">
                {error && <p role="alert">{error}</p>}
                <h2 id="ModalNovaMesa-title">Nova Mesa</h2>
                <input
                    type="text"
                    placeholder="Nome do cliente (opcional)"
                    value={nomeMesa}
                    onChange={e => setNomeMesa(e.target.value)}
                    autoFocus
                />
                <div className="modal-buttons">
                    <Botao tamanho='xxsm' cor='terciario'onClick={requestClose}>Cancelar</Botao>
                    <Botao tamanho='xxsm' cor='terciario'disabled={busy} onClick={criarMesa}>Criar</Botao>
                </div>
            </div>
        </FormModal>
    );
};

export default ModalNovaMesa;
