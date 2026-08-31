# Rafael Garcês — Site

Dois sites estáticos no mesmo repositório, cada um um arquivo único (sem build, sem dependências) — fonte (Satoshi), fotos e logo embutidos no HTML como base64.

- **`/` (raiz)** — `index.html` — portfólio, one page (Soluções, Metodologia, Quem Somos), header fixo com efeito glass.
- **`/cases`** — `cases/index.html` — galeria de cases. Um case real publicado (Loja MaiPhone) + espaço pronto pra receber os próximos.
- **`/trabalho/loja-maiphone`** — página exclusiva do case Loja MaiPhone.
- **`/links`** — `links/index.html` — link-in-bio.

## Deploy

Hospedado na Vercel, conectado a este repositório no GitHub. Todo push na branch `main` gera um novo deploy automaticamente.

## Editar

- Portfólio: editar `index.html` na raiz.
- Cases: editar `cases/index.html` (galeria) e `trabalho/<slug>/index.html` (cada case).
- Links: editar `links/index.html`.

Depois é só commit/push.
