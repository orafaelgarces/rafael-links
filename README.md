# Rafael Garcês — Site

Dois sites estáticos no mesmo repositório, cada um um arquivo único (sem build, sem dependências) — fonte (Satoshi), fotos e logo embutidos no HTML como base64.

- **`/` (raiz)** — `index.html` — portfólio, one page (Soluções, Metodologia, Cases, Quem Somos), header fixo com efeito glass. Cases aparece em destaque, com imagem ampliada e acesso à página exclusiva do projeto.
- **`/trabalho/loja-maiphone`** — página exclusiva do case Loja MaiPhone.
- **`/links`** — `links/index.html` — link-in-bio.

## Deploy

Hospedado na Vercel, conectado a este repositório no GitHub. Todo push na branch `main` gera um novo deploy automaticamente.

## Editar

- Portfólio e seção de Cases: editar `index.html` na raiz.
- Cada case: `trabalho/<slug>/index.html`.
- Links: editar `links/index.html`.

Depois é só commit/push.

## Prévia local

Na pasta do projeto, execute `python3 -m http.server 4173 --bind 127.0.0.1` e abra <http://127.0.0.1:4173>. Não exige build nem instalação de dependências.

A prévia local permite revisar as alterações antes de publicar. O deploy de produção é disparado pelo push em `main`.

## Revisão visual — setembro de 2026

Abertura com o símbolo original, cases antes de soluções, serviços com imagens ampliadas, metodologia compacta e perguntas frequentes. A referência visual principal é a Human Academy, preservando Satoshi, verde-limão, temas claro/escuro e mídia existente. Nenhum depoimento, métrica ou prazo comercial foi inventado.
