# Frontend React + Vite + Supabase

Execute nesta pasta com Node.js 22.12 ou superior:

```text
npm install
npm run dev
npm run build
npm test
```

Copie .env.example para .env.local e configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. Apenas chave publishable ou anon: nunca service_role ou secret. O frontend utiliza Supabase diretamente; o backend legado nao e necessario para a V2.

Acesse http://127.0.0.1:5173/login. Administrador inicial aprovado: dejandreafranca@gmail.com. Esse cadastro ja existe no Auth e aguarda confirmacao de email. Confirme o email recebido; se necessario, use a recuperacao de senha. Nao reutilize a senha antiga do Mongo.

ADMIN gerencia usuarios e operacoes. OPERATOR gerencia clientes, lancamentos, mesas e itens. Novos usuarios precisam de aprovacao previa na tela Usuarios e cadastro proprio em Primeiro acesso. Desativacao bloqueia o acesso no banco mesmo com uma sessao anterior. Confirmacao de email e obrigatoria.

As migrations em ../supabase/migrations implementam permissoes, integridade e calculos; ja foram aplicadas ao projeto klrnvnzhzmazuaawxele. Nao reaplique SQL manualmente nesse projeto. ../supabase/tests/v2_auth_crud.sql utiliza dados ficticios e transacao com rollback.

Antes de publicar, configure no Supabase Auth Site URL e Redirect URLs para as rotas /login e /alterar-senha, inclusive a origem local durante desenvolvimento. Verifique entrega de email/SMTP. A hospedagem deve redirecionar rotas da SPA para index.html. Build em dist/. Nenhum deploy foi executado.
