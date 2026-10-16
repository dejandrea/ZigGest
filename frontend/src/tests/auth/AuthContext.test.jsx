import React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,waitFor,act} from '@testing-library/react';
import {AuthProvider,useAuth} from '../../auth/AuthContext';
const mock=vi.hoisted(()=>({getSession:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),subscribe:vi.fn(),unsubscribe:vi.fn(),callbacks:[]}));
vi.mock('../../services/supabase',()=>({configurationError:null,supabase:{rpc:mock.rpc,auth:{getSession:mock.getSession,getUser:mock.getUser,onAuthStateChange:mock.subscribe}}}));
function Probe(){const {profile,loading,error,recovery}=useAuth();return <><p>{loading?'loading':profile?.role??'denied'}</p><p>{error}</p>{recovery&&<p>recovery</p>}</>;}
beforeEach(()=>{
  mock.callbacks=[];mock.getSession.mockResolvedValue({data:{session:{user:{id:'fixture'}}}});
  mock.getUser.mockResolvedValue({data:{user:{id:'fixture'}},error:null});
  mock.rpc.mockResolvedValue({data:[{role:'OPERATOR'}],error:null});
  mock.subscribe.mockImplementation(callback=>{mock.callbacks.push(callback);return{data:{subscription:{unsubscribe:mock.unsubscribe}}};});
});
it('verifies the Auth user before loading permissions',async()=>{
  render(<AuthProvider><Probe/></AuthProvider>);
  expect(await screen.findByText('OPERATOR')).toBeInTheDocument();
  expect(mock.getUser).toHaveBeenCalled();expect(mock.rpc).toHaveBeenCalledWith('my_app_profile');
});
it('rejects an unverified cached session',async()=>{
  mock.getUser.mockResolvedValue({data:{user:null},error:{message:'invalid'}});
  render(<AuthProvider><Probe/></AuthProvider>);
  expect(await screen.findByText('denied')).toBeInTheDocument();expect(mock.rpc).not.toHaveBeenCalled();
});
it('removes access when the server profile is disabled',async()=>{
  render(<AuthProvider><Probe/></AuthProvider>);await screen.findByText('OPERATOR');
  mock.rpc.mockResolvedValue({data:[],error:null});
  await act(async()=>{window.dispatchEvent(new Event('focus'));});
  await waitFor(()=>expect(screen.getByText('denied')).toBeInTheDocument());
});
it('handles password recovery and unsubscribes on unmount',async()=>{
  const view=render(<AuthProvider><Probe/></AuthProvider>);await screen.findByText('OPERATOR');
  await act(async()=>{mock.callbacks[0]('PASSWORD_RECOVERY',{user:{id:'fixture'}});});
  expect(screen.getByText('recovery')).toBeInTheDocument();view.unmount();expect(mock.unsubscribe).toHaveBeenCalled();
});
