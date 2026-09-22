/**
 * CSAT — API da planilha para o formulário (/feedback/) e o painel (/feedback/painel/).
 *
 * Abas:
 *  - Respostas: uma linha por envio (cabeçalho monta sozinho).
 *  - Perguntas: configuração dos formulários (edite aqui, sem código).
 *  - Config:    código de acesso do painel (B1).
 *
 * Instalação / atualização:
 *  1. Cole este arquivo no editor do Apps Script (substituindo o anterior) e salve.
 *  2. Selecione a função "instalar" no menu acima e clique em Executar (uma vez).
 *     Cria as abas Perguntas e Config, formata Respostas e gera o código de acesso.
 *  3. Implantar → Gerenciar implantações → lápis → Versão: "Nova versão" → Implantar.
 *     (A URL /exec continua a mesma.)
 */
var ABA_RESPOSTAS = 'Respostas';
var ABA_PERGUNTAS = 'Perguntas';
var ABA_CONFIG = 'Config';

var CSAT_COL = { fundo: '#f5f5f7', destaque: '#ddff22', texto: '#131720' };

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var dados = JSON.parse(e.postData.contents);
    var aba = abaRespostas_();
    var cabecalho = lerCabecalho_(aba);

    Object.keys(dados).forEach(function (k) {
      if (cabecalho.indexOf(k) === -1) {
        cabecalho.push(k);
        aba.getRange(1, cabecalho.length).setValue(k);
      }
    });
    var linha = cabecalho.map(function (col) {
      if (col === 'Data') return new Date();
      return dados[col] != null ? dados[col] : '';
    });
    aba.appendRow(linha);
    formatarRespostas_(aba);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var acao = p.acao || '';

  if (acao === 'perguntas') return json_({ ok: true, perguntas: lerPerguntas_() });

  if (acao === 'respostas') {
    if (!tokenValido_(p.token)) return json_({ ok: false, erro: 'acesso negado' });
    return json_({ ok: true, respostas: lerRespostas_(), perguntas: lerPerguntas_() });
  }

  return ContentService.createTextOutput('CSAT: endpoint ativo.');
}

/* ------------------------------------------------------------------ */
/* Instalação (rodar uma vez pelo editor)                              */
/* ------------------------------------------------------------------ */

function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Config + código de acesso
  var cfg = ss.getSheetByName(ABA_CONFIG) || ss.insertSheet(ABA_CONFIG);
  if (!cfg.getRange('B1').getValue()) {
    cfg.getRange('A1').setValue('Código de acesso do painel').setFontWeight('bold');
    cfg.getRange('B1').setValue(gerarCodigo_());
    cfg.getRange('A2').setValue('Use este código em /feedback/painel/. Para trocar, apague B1 e rode "instalar" de novo.')
      .setFontColor('#6b7280');
    cfg.setColumnWidth(1, 240);
    cfg.setColumnWidth(2, 260);
  }

  // Perguntas (só cria se não existir, pra não apagar edições)
  if (!ss.getSheetByName(ABA_PERGUNTAS)) {
    var pq = ss.insertSheet(ABA_PERGUNTAS);
    var linhas = [['servico', 'id', 'tipo', 'texto', 'opcoes', 'ativo']].concat(perguntasPadrao_());
    pq.getRange(1, 1, linhas.length, 6).setValues(linhas);
    pq.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground(CSAT_COL.fundo);
    pq.setFrozenRows(1);
    pq.setColumnWidth(1, 90);
    pq.setColumnWidth(2, 110);
    pq.setColumnWidth(3, 80);
    pq.setColumnWidth(4, 520);
    pq.setColumnWidth(5, 220);
    pq.setColumnWidth(6, 60);
    var regraTipo = SpreadsheetApp.newDataValidation().requireValueInList(['csat', 'nps', 'texto', 'escolha', 'mes'], true).build();
    pq.getRange(2, 3, 200, 1).setDataValidation(regraTipo);
    var regraServ = SpreadsheetApp.newDataValidation().requireValueInList(['site', 'marca', 'design'], true).build();
    pq.getRange(2, 1, 200, 1).setDataValidation(regraServ);
    var regraAtivo = SpreadsheetApp.newDataValidation().requireValueInList(['sim', 'não'], true).build();
    pq.getRange(2, 6, 200, 1).setDataValidation(regraAtivo);
  }

  formatarRespostas_(abaRespostas_());
  ss.setActiveSheet(cfg);
  Logger.log('Pronto. Código de acesso do painel: ' + cfg.getRange('B1').getValue());
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

function lerPerguntas_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_PERGUNTAS);
  var saida = { site: [], marca: [], design: [] };
  if (!aba || aba.getLastRow() < 2) return saida;
  var vals = aba.getRange(2, 1, aba.getLastRow() - 1, 6).getValues();
  vals.forEach(function (r) {
    var servico = String(r[0]).trim(), id = String(r[1]).trim(), tipo = String(r[2]).trim(), texto = String(r[3]).trim();
    var ativo = String(r[5]).trim().toLowerCase();
    if (!servico || !id || !tipo || !texto || ativo === 'não' || ativo === 'nao') return;
    if (!saida[servico]) saida[servico] = [];
    var q = { id: id, tipo: tipo, texto: texto };
    if (tipo === 'escolha') q.opcoes = String(r[4]).split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    saida[servico].push(q);
  });
  return saida;
}

function lerRespostas_() {
  var aba = abaRespostas_();
  if (aba.getLastRow() < 2) return [];
  var cab = lerCabecalho_(aba);
  var vals = aba.getRange(2, 1, aba.getLastRow() - 1, cab.length).getValues();
  return vals.map(function (r) {
    var o = {};
    cab.forEach(function (c, i) {
      var v = r[i];
      if (v instanceof Date) v = v.toISOString();
      if (v !== '' && v !== null) o[c] = v;
    });
    return o;
  });
}

/* ------------------------------------------------------------------ */
/* Formatação visual da aba Respostas                                  */
/* ------------------------------------------------------------------ */

function formatarRespostas_(aba) {
  var cab = lerCabecalho_(aba);
  if (!cab.length) return;
  var nCols = cab.length;
  var nLinhas = Math.max(aba.getLastRow(), 2);

  var head = aba.getRange(1, 1, 1, nCols);
  head.setFontWeight('bold').setBackground(CSAT_COL.texto).setFontColor('#ffffff')
      .setVerticalAlignment('middle').setWrap(true);
  aba.setRowHeight(1, 44);
  aba.setFrozenRows(1);
  aba.setFrozenColumns(3);

  cab.forEach(function (c, i) {
    var col = i + 1;
    var eNota = /\?$|\.$/.test(c) && c !== 'Nome' && c !== 'Cliente';
    if (c === 'Data') {
      aba.getRange(2, col, nLinhas - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
      aba.setColumnWidth(col, 130);
    } else if (c === 'Serviço' || c === 'Cliente' || c === 'Nome') {
      aba.setColumnWidth(col, c === 'Serviço' ? 130 : 170);
    } else if (c === 'Média CSAT' || c === 'NPS') {
      aba.setColumnWidth(col, 90);
      aba.getRange(2, col, nLinhas - 1, 1).setHorizontalAlignment('center').setFontWeight('bold');
    } else if (c === 'Mês de referência') {
      aba.setColumnWidth(col, 110);
      aba.getRange(2, col, nLinhas - 1, 1).setHorizontalAlignment('center');
    } else {
      // perguntas: notas centralizadas, textos com quebra
      aba.setColumnWidth(col, 200);
      aba.getRange(2, col, nLinhas - 1, 1).setWrap(true).setVerticalAlignment('top');
    }
  });

  // Faixas de nota: 1–2 vermelho suave, 3 âmbar, 4–5 verde-limão da marca
  var regras = [];
  var faixaTotal = aba.getRange(2, 1, nLinhas - 1, nCols);
  regras.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(1, 2.9).setBackground('#fde2e1').setRanges([faixaTotal]).build());
  regras.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(3, 3.9).setBackground('#fdf1d2').setRanges([faixaTotal]).build());
  regras.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(4, 5).setBackground('#eef7c2').setRanges([faixaTotal]).build());
  var idxNps = cab.indexOf('NPS');
  if (idxNps > -1) {
    var faixaNps = aba.getRange(2, idxNps + 1, nLinhas - 1, 1);
    regras.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(0, 6).setBackground('#fde2e1').setRanges([faixaNps]).build());
    regras.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(7, 8).setBackground('#fdf1d2').setRanges([faixaNps]).build());
    regras.push(SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(9, 10).setBackground(CSAT_COL.destaque).setRanges([faixaNps]).build());
  }
  aba.setConditionalFormatRules(regras);

  // Filtro no cabeçalho + linhas alternadas
  if (!aba.getFilter()) aba.getRange(1, 1, nLinhas, nCols).createFilter();
  var bandas = aba.getRange(1, 1, nLinhas, nCols).getBandings();
  if (!bandas.length) aba.getRange(1, 1, nLinhas, nCols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function abaRespostas_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_RESPOSTAS) || ss.insertSheet(ABA_RESPOSTAS);
  if (!aba.getLastRow()) {
    aba.getRange(1, 1, 1, 4).setValues([['Data', 'Serviço', 'Cliente', 'Nome']]);
  }
  return aba;
}

function lerCabecalho_(aba) {
  return aba.getLastColumn() ? aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].filter(String) : [];
}

function tokenValido_(t) {
  var cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_CONFIG);
  var esperado = cfg ? String(cfg.getRange('B1').getValue()).trim() : '';
  return !!esperado && String(t || '').trim() === esperado;
}

function gerarCodigo_() {
  var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < 12; i++) s += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function perguntasPadrao_() {
  var fim = [
    ['gostou', 'texto', 'O que você mais gostou no projeto?', ''],
    ['melhorar', 'texto', 'O que poderia ter sido melhor?', ''],
    ['nps', 'nps', 'De 0 a 10, quanto você indicaria meu trabalho para alguém?', ''],
    ['depoimento', 'escolha', 'Posso usar parte das suas respostas como depoimento no site?', 'Sim, pode usar | Prefiro que não']
  ];
  var site = [
    ['resultado', 'csat', 'Como você avalia o resultado final do site?', ''],
    ['marca', 'csat', 'O site representa bem a sua marca e o seu negócio?', ''],
    ['objetivo', 'csat', 'O site atende ao objetivo que motivou o projeto (vender, captar contatos, apresentar)?', ''],
    ['uso', 'csat', 'Facilidade de navegação e clareza das informações para quem visita.', ''],
    ['comunicacao', 'csat', 'Comunicação e alinhamento durante o projeto.', ''],
    ['prazo', 'csat', 'Cumprimento de prazos e organização das etapas.', '']
  ].concat(fim);
  var marca = [
    ['resultado', 'csat', 'Como você avalia o resultado final da identidade visual?', ''],
    ['essencia', 'csat', 'A marca traduz a essência e o posicionamento do seu negócio?', ''],
    ['processo', 'csat', 'Clareza do processo: imersão, direção criativa e apresentação.', ''],
    ['aplicacao', 'csat', 'Facilidade de aplicar a identidade no dia a dia (arquivos, manual, orientações).', ''],
    ['comunicacao', 'csat', 'Comunicação e escuta durante o projeto.', ''],
    ['prazo', 'csat', 'Cumprimento de prazos e organização das etapas.', '']
  ].concat(fim);
  var design = [
    ['mes', 'mes', 'Mês de referência', ''],
    ['qualidade', 'csat', 'Qualidade das peças entregues no mês (estáticos, carrosséis, edições).', ''],
    ['identidade', 'csat', 'Alinhamento das peças com a identidade e o tom da marca.', ''],
    ['agilidade', 'csat', 'Agilidade nas entregas e nos ajustes.', ''],
    ['volume', 'csat', 'O volume de entregas atendeu à demanda do mês?', ''],
    ['comunicacao', 'csat', 'Comunicação, briefings e fluxo de aprovação.', ''],
    ['proatividade', 'csat', 'Proatividade e sugestões criativas além do pedido.', ''],
    ['destaque', 'texto', 'Qual entrega se destacou neste mês?', ''],
    ['ajustar', 'texto', 'O que ajustar para o próximo mês?', ''],
    ['nps', 'nps', 'De 0 a 10, quanto você indicaria meu trabalho para alguém?', '']
  ];
  var linhas = [];
  [['site', site], ['marca', marca], ['design', design]].forEach(function (par) {
    par[1].forEach(function (q) { linhas.push([par[0], q[0], q[1], q[2], q[3], 'sim']); });
  });
  return linhas;
}
