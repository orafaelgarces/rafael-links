/**
 * CSAT — API da planilha para o formulário (/feedback/) e o painel (/feedback/painel/).
 *
 * Abas:
 *  - Respostas: uma linha por envio (cabeçalho monta sozinho).
 *  - Perguntas: configuração dos formulários (edite aqui, sem código).
 *  - Config:    código de acesso do painel (B1).
 *  - Clientes:  cadastro de clientes (gerido pelo painel; criada sozinha no primeiro uso).
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
var ABA_CLIENTES = 'Clientes';
var CLIENTE_COLS = ['id', 'nome', 'servicos', 'cobranca', 'fee', 'inicio', 'renovacao_meses', 'status', 'encerramento',
  'stakeholder', 'whatsapp', 'email', 'dia_csat', 'origem', 'segmento', 'obs', 'criado_em', 'atualizado_em'];

var CSAT_COL = { fundo: '#f5f5f7', destaque: '#ddff22', texto: '#131720' };

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var dados = JSON.parse(e.postData.contents);

    // Ações administrativas (painel): exigem o código de acesso
    if (dados.acao) {
      if (!tokenValido_(dados.token)) return json_({ ok: false, erro: 'acesso negado' });
      if (dados.acao === 'excluir') return json_(excluirResposta_(dados.data));
      if (dados.acao === 'cliente_salvar') return json_(salvarCliente_(dados.cliente || {}));
      if (dados.acao === 'cliente_excluir') return json_(excluirCliente_(dados.id));
      return json_({ ok: false, erro: 'ação desconhecida' });
    }

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
    return json_({ ok: true, respostas: lerRespostas_(), perguntas: lerPerguntas_(), clientes: lerClientes_() });
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

/* Remove a linha cuja Data (ISO) bate com a informada e limpa colunas
   que ficarem sem nenhum dado. */
function excluirResposta_(dataIso) {
  var aba = abaRespostas_();
  if (aba.getLastRow() < 2) return { ok: false, erro: 'sem respostas' };
  var alvo = new Date(dataIso).getTime();
  var datas = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues();
  var linha = -1;
  for (var i = 0; i < datas.length; i++) {
    var d = datas[i][0];
    if (d instanceof Date && Math.abs(d.getTime() - alvo) < 1000) { linha = i + 2; break; }
  }
  if (linha < 0) return { ok: false, erro: 'não encontrada' };
  aba.deleteRow(linha);
  var removidas = limparColunasVazias_(aba);
  return { ok: true, colunasRemovidas: removidas };
}

function limparColunasVazias_(aba) {
  var fixas = ['Data', 'Serviço', 'Cliente', 'Nome', 'Média CSAT', 'NPS'];
  var cab = lerCabecalho_(aba);
  var nLinhas = aba.getLastRow() - 1;
  var removidas = 0;
  for (var c = cab.length; c >= 1; c--) {
    if (fixas.indexOf(cab[c - 1]) > -1) continue;
    var vazia = nLinhas < 1 || aba.getRange(2, c, nLinhas, 1).getValues().every(function (r) { return r[0] === '' || r[0] === null; });
    if (vazia) { aba.deleteColumn(c); removidas++; }
  }
  return removidas;
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

function abaClientes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_CLIENTES);
  if (!aba) {
    aba = ss.insertSheet(ABA_CLIENTES);
    aba.getRange(1, 1, 1, CLIENTE_COLS.length).setValues([CLIENTE_COLS])
      .setFontWeight('bold').setBackground(CSAT_COL.texto).setFontColor('#ffffff');
    aba.setFrozenRows(1);
    aba.setFrozenColumns(2);
    // datas e texto: evita a planilha converter dia/mês e telefone
    aba.getRange(2, CLIENTE_COLS.indexOf('whatsapp') + 1, 500, 1).setNumberFormat('@');
    aba.getRange(2, CLIENTE_COLS.indexOf('fee') + 1, 500, 1).setNumberFormat('R$ #,##0.00');
    ['inicio', 'encerramento', 'criado_em', 'atualizado_em'].forEach(function (c) {
      aba.getRange(2, CLIENTE_COLS.indexOf(c) + 1, 500, 1).setNumberFormat('dd/mm/yyyy');
    });
    aba.setColumnWidth(CLIENTE_COLS.indexOf('nome') + 1, 200);
    aba.setColumnWidth(CLIENTE_COLS.indexOf('obs') + 1, 320);
  }
  return aba;
}

function lerClientes_() {
  var aba = abaClientes_();
  if (aba.getLastRow() < 2) return [];
  var vals = aba.getRange(2, 1, aba.getLastRow() - 1, CLIENTE_COLS.length).getValues();
  return vals.filter(function (r) { return r[0]; }).map(function (r) {
    var o = {};
    CLIENTE_COLS.forEach(function (c, i) {
      var v = r[i];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      o[c] = v === null ? '' : v;
    });
    return o;
  });
}

function salvarCliente_(c) {
  if (!c.nome || !String(c.nome).trim()) return { ok: false, erro: 'nome obrigatório' };
  var aba = abaClientes_();
  var agora = new Date();
  var linha = -1;
  if (c.id) {
    var ids = aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues() : [];
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(c.id)) { linha = i + 2; break; }
  }
  if (linha < 0) { c.id = 'c_' + agora.getTime().toString(36); c.criado_em = agora; }
  else { c.criado_em = aba.getRange(linha, CLIENTE_COLS.indexOf('criado_em') + 1).getValue() || agora; }
  c.atualizado_em = agora;

  var valores = CLIENTE_COLS.map(function (col) {
    var v = c[col];
    if (v === undefined || v === null) return '';
    if (['inicio', 'encerramento'].indexOf(col) > -1) return v ? paraData_(v) : '';
    if (col === 'fee') return v === '' ? '' : Number(v);
    if (col === 'renovacao_meses' || col === 'dia_csat') return v === '' ? '' : Number(v);
    if (Array.isArray(v)) return v.join('|');
    return v;
  });
  if (linha < 0) aba.appendRow(valores); else aba.getRange(linha, 1, 1, valores.length).setValues([valores]);
  return { ok: true, cliente: lerClientes_().filter(function (x) { return x.id === c.id; })[0] };
}

function excluirCliente_(id) {
  var aba = abaClientes_();
  if (aba.getLastRow() < 2) return { ok: false, erro: 'não encontrado' };
  var ids = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) { aba.deleteRow(i + 2); return { ok: true }; }
  return { ok: false, erro: 'não encontrado' };
}

function paraData_(v) {
  if (v instanceof Date) return v;
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
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
    ['identidade', 'csat', 'Alinhamento das peças com a identidade visual da marca.', ''],
    ['agilidade', 'csat', 'Agilidade nas entregas e nos ajustes.', ''],
    ['comunicacao', 'csat', 'Comunicação e fluxo de aprovação.', ''],
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
