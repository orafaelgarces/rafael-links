# Rafael Garcês — Links

Página pessoal de link-in-bio, servida em `/links`. Site estático de arquivo único (`links/index.html`), sem build, sem dependências — fonte (Satoshi), fotos e logo já estão embutidos no HTML como base64.

A raiz do domínio (`/`) redireciona para `/links` por enquanto (ver `vercel.json`). Quando o site principal estiver pronto, é só apagar esse redirect e colocar o novo site na raiz — `/links` continua funcionando do mesmo jeito.

## Deploy

Hospedado na Vercel, conectado a este repositório no GitHub. Todo push na branch `main` gera um novo deploy automaticamente.

## Editar

Basta editar `links/index.html` diretamente e dar commit/push.
