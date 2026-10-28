/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - WEBHOOK DE CRIAÇÃO DE PASTAS NO GOOGLE DRIVE
 * Andressa Spagnol Imóveis - CRM Imobiliário
 * ============================================================================
 *
 * COMO PUBLICAR NO script.google.com:
 * 1. Acesse https://script.google.com e crie um "Novo Projeto".
 * 2. Cole este código no arquivo `Código.gs` (substituindo todo o conteúdo).
 * 3. (Opcional) Defina o ID de uma pasta-mãe na constante `PASTA_RAIZ_ID` abaixo
 *    para organizar todas as captações dentro de uma única pasta no seu Drive.
 * 4. Clique em "Implantar" > "Nova implantação".
 * 5. Em "Selecionar tipo", escolha "App da Web".
 * 6. Configure:
 *    - Executar como: "Eu" (seu e-mail Google)
 *    - Quem pode acessar: "Qualquer pessoa" (necessário para aceitar requisições CORS do navegador)
 * 7. Autorize as permissões do Google Drive e copie a URL do App da Web gerada
 *    para a constante `WEBHOOK_URL` no arquivo `js/config.js`.
 */

// Opcional: ID da pasta principal no Google Drive onde as pastas dos imóveis serão criadas.
// Deixe vazio ("") para criar na raiz do Meu Drive ou ter uma pasta "CRM - Captações Imóveis" criada automaticamente.
const PASTA_RAIZ_ID = "";
const NOME_PASTA_PADRAO = "Andressa Spagnol Imóveis - Captações";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responderJSON({
        success: false,
        error: "Payload vazio ou inválido."
      });
    }

    const dados = JSON.parse(e.postData.contents);
    const nomeImovel = (dados.titulo || dados.nome || "").toString().trim();

    if (!nomeImovel) {
      return responderJSON({
        success: false,
        error: "O título/nome do imóvel é obrigatório."
      });
    }

    // Determinar pasta-mãe onde a pasta do imóvel será criada
    let pastaMae;
    if (PASTA_RAIZ_ID && PASTA_RAIZ_ID.trim() !== "") {
      pastaMae = DriveApp.getFolderById(PASTA_RAIZ_ID.trim());
    } else {
      const iterador = DriveApp.getFoldersByName(NOME_PASTA_PADRAO);
      pastaMae = iterador.hasNext()
        ? iterador.next()
        : DriveApp.createFolder(NOME_PASTA_PADRAO);
    }

    // Formatar nome da pasta com data de captação para fácil organização
    const dataFormatada = Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
    const nomePastaFinal = `${nomeImovel} (${dataFormatada})`;

    // Criar pasta principal do imóvel e subpastas organizacionais
    const pastaImovel = pastaMae.createFolder(nomePastaFinal);
    pastaImovel.createFolder("01. Fotos e Vídeos");
    pastaImovel.createFolder("02. Documentação do Imóvel");

    return responderJSON({
      success: true,
      folderName: nomePastaFinal,
      folderId: pastaImovel.getId(),
      url: pastaImovel.getUrl()
    });
  } catch (erro) {
    return responderJSON({
      success: false,
      error: erro.toString()
    });
  }
}

/**
 * Helper para retornar resposta JSON com MIME Type adequado do Apps Script
 */
function responderJSON(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

