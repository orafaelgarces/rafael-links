# Rafael Garcês — Site

Dois sites estáticos no mesmo repositório, cada um um arquivo único (sem build, sem dependências) — fonte (Satoshi), fotos e logo embutidos no HTML como base64.

- **`/` (raiz)** — `index.html` — portfólio, one page (Soluções, Metodologia, Cases, Quem Somos), header fixo com efeito glass. Cases aparece como seção com scroll horizontal, cada card abre a página exclusiva do case.
- **`/trabalho/loja-maiphone`** — página exclusiva do case Loja MaiPhone.
- **`/links`** — `links/index.html` — link-in-bio.

## Deploy

Hospedado na Vercel, conectado a este repositório no GitHub. Todo push na branch `main` gera um novo deploy automaticamente.

## Editar

- Portfólio e seção de Cases: editar `index.html` na raiz.
- Cada case: `trabalho/<slug>/index.html`.
- Links: editar `links/index.html`.

Depois é só commit/push.
