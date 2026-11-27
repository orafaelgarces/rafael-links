// Animação do logo Dalila Leão (v3). montarLogo(lk) devolve uma timeline GSAP pausada.
// lk: div de 860x520 px (o logo vertical inteiro). Máscara: variável CSS --logo.
// Sem emendas: quando uma etapa termina, as peças dão lugar a uma camada única.
function montarLogo(lk){
  const S=860/3940;
  const P={
    arco:{box:[1698,-6,2322,1114],poly:[[1698,-6],[2322,-6],[2322,964],[2194,964],[2194,1114],[1862,1114],[1862,300],[1911,300],[1911,244],[1698,244]]},
    haste2:{box:[1738,245,1910,1229],poly:[[1738,245],[1910,245],[1910,300],[1861,300],[1861,1229],[1738,1229],[1738,1116],[1792,1116],[1792,1066],[1738,1066]]},
    pe:{box:[1738,1124,2332,1256],poly:[[1738,1229],[2258,1229],[2258,1124],[2332,1124],[2332,1256],[1738,1256]]},
    haste1:{box:[1510,245,1790,1112],poly:[[1510,245],[1700,245],[1700,1072],[1790,1072],[1790,1112],[1510,1112]]},
    letras:{box:[1500,-10,2450,1262],poly:[[1500,-10],[2450,-10],[2450,964],[2194,964],[2194,1124],[2450,1124],[2450,1262],[1500,1262]]},
    // as mãos avançam 16 unidades sobre o cabo, que já está visível: não fica linha na junção
    maoE:{box:[2194,964,2442,1140],poly:[[2194,964],[2278,964],[2278,1026],[2316,1026],[2316,1140],[2194,1140]]},
    maoD:{box:[2194,964,2442,1140],poly:[[2316,1026],[2354,1026],[2354,964],[2442,964],[2442,1140],[2316,1140]]},
    maos:{box:[2194,964,2442,1140],poly:[[2194,964],[2278,964],[2278,1026],[2354,1026],[2354,964],[2442,964],[2442,1140],[2194,1140]]},
    broto:{box:[2279,964,2353,1025]},
    inteiro:{box:[1500,-10,2450,1262]},
    nome:{box:[-4,1418,3944,2052]}, prof:{box:[1060,2190,2900,2386]}};
  const el={};
  for(const [id,p] of Object.entries(P)){ const [x0,y0,x1,y1]=p.box.map(v=>v*S); const w=document.createElement("div"); w.className="pc"; w.dataset.p=id;
    Object.assign(w.style,{position:"absolute",overflow:"hidden",left:x0+"px",top:y0+"px",width:(x1-x0)+"px",height:(y1-y0)+"px"});
    const i=document.createElement("i"); Object.assign(i.style,{position:"absolute",display:"block",width:"860px",height:"520px",left:-x0+"px",top:-y0+"px",background:"var(--tinta,#55573F)",webkitMask:"var(--logo) 0 0/860px 520px no-repeat",mask:"var(--logo) 0 0/860px 520px no-repeat"});
    if(p.poly) i.style.clipPath="polygon("+p.poly.map(([x,y])=>(x*S)+"px "+(y*S)+"px").join(",")+")"; w.appendChild(i); lk.appendChild(w); el[id]=w; }
  const cg="conic-gradient(from -12deg at "+((1716-1698)*S)+"px "+((556+6)*S)+"px,#000 0deg,#000 var(--ang),transparent var(--ang))";
  el.arco.style.webkitMask=cg; el.arco.style.mask=cg;
  const mx=((1523+2431)/2)*S,my=625*S,fx=2316*S,fy=1050*S,Y0=675-(415+my);
  const orig=((2316-2194)*S)+"px "+((1121-964)*S)+"px";
  gsap.set(lk,{transformOrigin:mx+"px "+my+"px",scale:2,x:0,y:Y0});
  gsap.set(el.arco,{"--ang":"0deg"});
  gsap.set(el.haste2,{clipPath:"inset(88% 0% 12% 0%)",autoAlpha:0}); gsap.set(el.pe,{clipPath:"inset(0% 100% 0% 0%)"}); gsap.set(el.haste1,{clipPath:"inset(100% 0% 0% 0%)"});
  gsap.set([el.letras,el.maos,el.inteiro],{autoAlpha:0});
  gsap.set(el.maoE,{transformOrigin:orig,rotation:-42,scale:.6,autoAlpha:0}); gsap.set(el.maoD,{transformOrigin:orig,rotation:42,scale:.6,autoAlpha:0});
  gsap.set(el.broto,{autoAlpha:0,y:-22,scale:.8,transformOrigin:"50% 100%"});
  gsap.set(el.nome,{clipPath:"inset(0% 100% 0% 0%)",autoAlpha:0}); gsap.set(el.prof,{autoAlpha:0,y:8});
  const tl=gsap.timeline({paused:true});
  tl.to(el.arco,{"--ang":"206deg",duration:1.7,ease:"power2.inOut"},.3)
    .set(el.haste2,{autoAlpha:1},1.45).to(el.haste2,{clipPath:"inset(0% 0% 0% 0%)",duration:1.15,ease:"power3.out"},1.45)
    .to(el.haste1,{clipPath:"inset(0% 0% 0% 0%)",duration:1.2,ease:"power3.out"},1.62)
    .to(el.pe,{clipPath:"inset(0% 0% 0% 0%)",duration:1.0,ease:"power2.inOut"},1.8)
    // letras prontas: camada única no lugar das quatro peças
    .set(el.letras,{autoAlpha:1},2.85).set([el.arco,el.haste2,el.haste1,el.pe],{autoAlpha:0},2.86)
    // aproximação suave da flor, que começa antes de as letras terminarem
    .to(lk,{scale:2.35,x:(mx-fx)*1.0,y:Y0+(my-fy)*1.0,duration:2.1,ease:"sine.inOut"},2.2)
    .to(el.maoE,{rotation:0,scale:1,autoAlpha:1,duration:1.15,ease:"power2.out"},2.75)
    .to(el.maoD,{rotation:0,scale:1,autoAlpha:1,duration:1.15,ease:"power2.out"},2.87)
    .set(el.maos,{autoAlpha:1},4.03).set([el.maoE,el.maoD],{autoAlpha:0},4.04)
    .to(el.broto,{autoAlpha:1,duration:.5,ease:"sine.out"},3.7).to(el.broto,{y:0,scale:1,duration:.95,ease:"power2.out"},3.7)
    // tudo no lugar: o monograma inteiro, sem nenhum recorte
    .set(el.inteiro,{autoAlpha:1},4.7).set([el.letras,el.maos,el.broto],{autoAlpha:0},4.71)
    .to(lk,{scale:1,x:0,y:0,duration:1.7,ease:"power2.inOut"},4.55)
    .to(el.nome,{autoAlpha:1,duration:.5,ease:"sine.out"},5.7).to(el.nome,{clipPath:"inset(0% 0% 0% 0%)",duration:1.4,ease:"power2.inOut"},5.7)
    .to(el.prof,{autoAlpha:1,y:0,duration:.9,ease:"sine.out"},6.75)
    .to({},{duration:1.3},7.7);
  return tl;
}
