import React from 'react';

const MesaCard = ({ mesa, onClick }) => {
  return (
    <div
      className={`border rounded p-4 shadow cursor-pointer ${
        mesa.status === 'fechada' ? 'bg-gray-200' : 'bg-white'
      }`}
      onClick={onClick}
    >
      <h2 className="font-bold text-lg">Mesa #{mesa.codigoMesa}</h2>
      <p>Cliente: {mesa.nomeCliente || 'Não informado'}</p>
      <p>Status: {mesa.status}</p>
      <p>Total: R$ {mesa.totalGeral.toFixed(2)}</p>
    </div>
  );
};

export default MesaCard;
