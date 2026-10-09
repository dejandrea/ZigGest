import React from 'react';
import '../styles/components/Botao.css';

const Botao = ({ onClick, children, tipo = 'button', cor = 'primario', tamanho = 'bg', ...rest }) => {
  return (
    <button
      type={tipo}
      className={`botao ${cor} ${tamanho}`}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Botao;
