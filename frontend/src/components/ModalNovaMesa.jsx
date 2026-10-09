import React, { useState } from 'react';
import axios from 'axios';
import api from '../services/api';
import Botao from './Botao';
import '../styles/components/Modal.css'

const ModalNovaMesa = ({ onClose }) => {
    const [nomeMesa, setNomeMesa] = useState('');

    const criarMesa = async () => {
        try {
            await api.post('/mesas', { nomeMesa });
            onClose();
        } catch (err) {
            console.error('Erro ao criar mesa', err);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>Nova Mesa</h2>
                <input
                    type="text"
                    placeholder="Nome do cliente (opcional)"
                    value={nomeMesa}
                    onChange={e => setNomeMesa(e.target.value)}
                    autoFocus
                />
                <div className="modal-buttons">
                    <Botao tamanho='xxsm' cor='terciario'onClick={onClose}>Cancelar</Botao>
                    <Botao tamanho='xxsm' cor='terciario'onClick={criarMesa}>Criar</Botao>
                </div>
            </div>
        </div>
    );
};

export default ModalNovaMesa;
