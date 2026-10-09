import React from 'react';
import '../styles/components/Header.css';
import logo from '../assets/logoConveniência.jpg'

const Header = () => {
  return (
    <header className="header">
      <img className='logoCliente' src={logo} alt="logo loja" />
      <div className='logoSistema'>
        <h2 className='nomeSistema'>ZigGest</h2>
        <span className='sloganSistema'>Gestão fácil e rápida para seu negócio</span>
      </div>
    </header>
  );
};

export default Header;
