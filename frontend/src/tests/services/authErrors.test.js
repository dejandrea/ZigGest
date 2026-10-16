import {describe,it,expect} from 'vitest';
import {authErrorMessage} from '../../services/authErrors';
describe('safe Auth errors',()=>{
  it('explains email throttling without exposing raw server details',()=>{
    expect(authErrorMessage({code:'over_email_send_rate_limit',message:'private-server-detail'},'signup')).toContain('Limite de envio');
  });
  it('distinguishes pending confirmation from an invalid password',()=>{
    expect(authErrorMessage({code:'email_not_confirmed'},'login')).toContain('Confirme seu e-mail');
    expect(authErrorMessage({code:'invalid_credentials'},'login')).toContain('senha invalidos');
  });
});
