import React from 'react';
export default function ModalDetalhesMesa({mesa,onClose}){return <div className='modal-overlay'><div className='modal'><h2>Mesa {mesa.codigoMesa}</h2><p>{mesa.nomeCliente}</p><p>{mesa.status}</p><button onClick={onClose}>Fechar</button></div></div>;}
