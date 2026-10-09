import React from 'react';
import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {it,expect} from 'vitest';
import App from './App';
it('renders the application',()=>{render(<MemoryRouter><App/></MemoryRouter>);expect(screen.getByText('ZigGest')).toBeInTheDocument();});
