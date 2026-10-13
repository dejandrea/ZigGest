export function authErrorMessage(error, mode) {
  const messages = {
    over_email_send_rate_limit: 'Limite de envio de e-mails do Supabase atingido. Aguarde a renovacao do limite e confira o e-mail de confirmacao ja enviado, inclusive o spam. Repetir o cadastro agora nao resolve.',
    over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
    email_not_confirmed: 'Confirme seu e-mail antes de entrar. Confira a caixa de entrada e o spam.',
    email_address_not_authorized: 'O servico de e-mail do Supabase nao esta autorizado a enviar para este endereco. O administrador precisa configurar o SMTP.',
    weak_password: 'Escolha uma senha mais forte, com pelo menos 8 caracteres.',
  };
  return messages[error?.code] ?? (mode === 'login'
    ? 'E-mail ou senha invalidos. Verifique os dados e tente novamente.'
    : 'Nao foi possivel concluir. Verifique seu cadastro com o administrador e tente novamente.');
}
