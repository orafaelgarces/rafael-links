/**
 * Recebe as respostas do formulário /feedback/ e grava numa aba "Respostas".
 *
 * Como usar (uma vez):
 * 1. Crie uma planilha no Google Sheets (ex.: "CSAT - Clientes").
 * 2. Extensões → Apps Script. Apague o conteúdo e cole este arquivo.
 * 3. Implantar → Nova implantação → tipo "App da Web".
 *    Executar como: você  ·  Quem tem acesso: Qualquer pessoa.
 * 4. Copie a URL (termina em /exec) e cole em SHEETS_URL no feedback/index.html.
 *
 * O cabeçalho é montado sozinho: cada chave nova vira uma coluna no fim.
 */
var ABA = 'Respostas';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var dados = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ss.getSheetByName(ABA) || ss.insertSheet(ABA);

    var cabecalho = aba.getLastRow() ? aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0] : [];
    if (!cabecalho.length) {
      cabecalho = ['Data'];
      aba.getRange(1, 1, 1, 1).setValues([cabecalho]).setFontWeight('bold');
      aba.setFrozenRows(1);
    }

    var chaves = Object.keys(dados);
    chaves.forEach(function (k) {
      if (cabecalho.indexOf(k) === -1) {
        cabecalho.push(k);
        aba.getRange(1, cabecalho.length).setValue(k).setFontWeight('bold');
      }
    });

    var linha = cabecalho.map(function (col) {
      if (col === 'Data') return new Date();
      return dados[col] != null ? dados[col] : '';
    });
    aba.appendRow(linha);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, erro: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/** Abrir a URL /exec no navegador mostra isto: serve só pra conferir que a implantação está viva. */
function doGet() {
  return ContentService.createTextOutput('CSAT: endpoint ativo. Envie um POST com JSON.');
}
