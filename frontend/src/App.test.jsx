import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import App from './App';

const mocks=vi.hoisted(()=>({auth:{},signIn:vi.fn(),signUp:vi.fn(),reset:vi.fn(),rpc:vi.fn()}));
vi.mock('./auth/AuthContext',()=>({useAuth:()=>mocks.auth}));
vi.mock('./services/supabase',()=>({configurationError:null,supabase:{rpc:mocks.rpc,auth:{signInWithPassword:mocks.signIn,signUp:mocks.signUp,resetPasswordForEmail:mocks.reset}}}));
vi.mock('./pages/Itens',()=>({default:()=> <h1>Cadastro de itens</h1>}));
vi.mock('./pages/Clientes',()=>({default:()=> <h1>Cadastro de clientes</h1>}));
function open(path='/'){return render(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>);}
beforeEach(()=>{
  mocks.auth={session:{user:{id:'fixture'}},profile:{nome:'Fixture',role:'OPERATOR'},isAdmin:false,loading:false,recovery:false,signOut:vi.fn().mockResolvedValue()};
  mocks.rpc.mockResolvedValue({data:[],error:null});mocks.signIn.mockResolvedValue({error:null});
  mocks.signUp.mockResolvedValue({error:null});mocks.reset.mockResolvedValue({error:null});
});
describe('protected application',()=>{
  it('renders the home and client navigation for an enabled operator',()=>{
    open();expect(screen.getByRole('heading',{name:'ZigGest'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Cadastros'}));
    fireEvent.click(screen.getByRole('button',{name:'Clientes'}));
    expect(screen.getByRole('heading',{name:'Cadastro de clientes'})).toBeInTheDocument();
  });
  it('keeps grouped navigation after moving to an existing screen',()=>{
    open('/clientes');
    expect(screen.getByRole('region',{name:'Cadastros'})).toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Financeiro'})).toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Estoque'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Clientes'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Cadastros'}));
    expect(screen.getByRole('button',{name:'Clientes'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('button',{name:'Itens'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Frente de loja'}));
    expect(screen.queryByRole('button',{name:'Clientes'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'PDV'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Frente de loja'}));
    expect(screen.queryByRole('button',{name:'PDV'})).not.toBeInTheDocument();
  });
  it('opens and closes mobile navigation',()=>{
    open();const toggle=screen.getByRole('button',{name:'Menu'});
    expect(toggle).toHaveAttribute('aria-expanded','false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button',{name:'Fechar menu'})).toHaveAttribute('aria-expanded','true');
    fireEvent.click(screen.getByRole('button',{name:'Cadastros'}));
    fireEvent.click(screen.getByRole('button',{name:'Clientes'}));
    expect(screen.getByRole('button',{name:'Menu'})).toHaveAttribute('aria-expanded','false');
  });
  it('redirects signed-out users to login',()=>{
    mocks.auth.session=null;mocks.auth.profile=null;open('/clientes');
    expect(screen.getByRole('heading',{name:'Entrar'})).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Cadastro de clientes'})).not.toBeInTheDocument();
  });
  it('does not treat a session without an approved profile as authorized',()=>{
    mocks.auth.profile=null;mocks.auth.error='Access disabled';open('/clientes');
    expect(screen.getByRole('heading',{name:'Acesso indisponível'})).toBeInTheDocument();
  });
  it('blocks the user-management route for operators',()=>{
    open('/usuarios');expect(screen.queryByRole('heading',{name:'Usuários'})).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith('admin_list_accounts');
    expect(mocks.rpc.mock.calls.every(([name])=>name==='system_notifications')).toBe(true);
  });
  it('shows user management only to administrators',async()=>{
    mocks.auth.profile.role='ADMIN';mocks.auth.isAdmin=true;open('/usuarios');
    await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('admin_list_accounts'));
    expect(screen.getByRole('heading',{name:'Usuários'})).toBeInTheDocument();
  });
  it('filters users and edits a registered account without changing its email',async()=>{
    mocks.auth.profile={id:'self',nome:'Admin',role:'ADMIN'};mocks.auth.isAdmin=true;
    mocks.rpc.mockResolvedValue({data:[{id:'u1',nome:'Pessoa Teste',email:'fixture@example.invalid',role:'OPERATOR',enabled:true,registered:true}],error:null});
    open('/usuarios');
    await screen.findByText('fixture@example.invalid');
    fireEvent.change(screen.getByLabelText('Buscar usuários'),{target:{value:'missing'}});
    expect(screen.getByText('Nenhum usuário corresponde à sua busca.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar usuários'),{target:{value:''}});
    fireEvent.click(screen.getByRole('button',{name:'Editar Pessoa Teste'}));
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.queryByRole('option',{name:'Master da plataforma'})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome completo'),{target:{value:'Pessoa Atualizada'}});
    fireEvent.click(screen.getByRole('button',{name:'Salvar acesso'}));
    await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('admin_save_account',{p_id:'u1',p_email:'fixture@example.invalid',p_nome:'Pessoa Atualizada',p_role:'OPERATOR',p_enabled:true}));
  });
  it('protects the signed-in master from editing their own role or enabled flag',async()=>{
    mocks.auth.profile={id:'self',nome:'Master',role:'MASTER'};mocks.auth.isAdmin=true;mocks.auth.isMaster=true;
    mocks.rpc.mockResolvedValue({data:[{id:'self',nome:'Master',email:'fixture@example.invalid',role:'MASTER',enabled:true,registered:true}],error:null});
    open('/usuarios');await screen.findByText('fixture@example.invalid');
    fireEvent.click(screen.getByRole('button',{name:'Editar Master'}));
    expect(screen.getByLabelText('Perfil de acesso')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
  it('sends login credentials only to Supabase Auth',async()=>{
    mocks.auth.session=null;mocks.auth.profile=null;open('/login');
    fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'fixture@example.invalid'}});
    fireEvent.change(screen.getByLabelText('Senha'),{target:{value:'Fictitious-password-123'}});
    fireEvent.click(screen.getByRole('button',{name:'Entrar'}));
    await waitFor(()=>expect(mocks.signIn).toHaveBeenCalledWith({email:'fixture@example.invalid',password:'Fictitious-password-123'}));
  });
  it('registers first access without granting a client-supplied role',async()=>{
    mocks.auth.session=null;mocks.auth.profile=null;open('/login');
    fireEvent.click(screen.getByRole('button',{name:'Primeiro acesso'}));
    fireEvent.change(screen.getByLabelText('E-mail'),{target:{value:'fixture@example.invalid'}});
    fireEvent.change(screen.getByLabelText('Senha'),{target:{value:'Fictitious-password-123'}});
    fireEvent.click(screen.getByRole('button',{name:'Confirmar primeiro acesso'}));
    await waitFor(()=>expect(mocks.signUp).toHaveBeenCalled());
    expect(mocks.signUp.mock.calls[0][0].options.data).toBeUndefined();
    expect(await screen.findByRole('status')).toHaveTextContent('confirmar');
  });
  it('routes recovery sessions to password change',()=>{
    mocks.auth.recovery=true;open('/clientes');
    expect(screen.getByRole('heading',{name:'Definir nova senha'})).toBeInTheDocument();
  });
});

it('opens items from the protected registration menu',()=>{
 open();
 fireEvent.click(screen.getByRole('button',{name:'Cadastros'}));
 fireEvent.click(screen.getByRole('button',{name:'Itens'}));
 expect(screen.getByRole('heading',{name:'Cadastro de itens'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Itens'})).toHaveAttribute('aria-current','page');
});
