/**
 * ============================================================================
 * GOOGLE APPS SCRIPT UNIFICADO (GOOGLE DRIVE + GOOGLE CALENDAR)
 * Andressa Spagnol Imóveis - CRM Imobiliário
 * ============================================================================
 * Este script suporta tanto:
 * 1. Criação de eventos de 1h no Google Calendar (quando recebe `titulo` e `data_hora`)
 * 2. Criação de pastas de imóveis no Google Drive (quando recebe `titulo` do imóvel)
 */

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

    // ------------------------------------------------------------------------
    // ROTA A: AGENDAMENTO NO GOOGLE CALENDAR (Módulo 3)
    // Acionada quando o JSON contém `data_hora` (ou `acao === "calendar"`)
    // ------------------------------------------------------------------------
    if (dados.data_hora || dados.acao === "calendar") {
      const tituloEvento = (dados.titulo || "").toString().trim();
      const dataHoraStr = (dados.data_hora || "").toString().trim();
      const descricao = (
        dados.descricao || "Compromisso agendado via CRM Andressa Spagnol Imóveis"
      ).toString().trim();

      if (!tituloEvento || !dataHoraStr) {
        return responderJSON({
          success: false,
          error: "Os campos 'titulo' e 'data_hora' são obrigatórios para agendamento."
        });
      }

      const dataInicio = new Date(dataHoraStr);
      if (isNaN(dataInicio.getTime())) {
        return responderJSON({
          success: false,
          error: "Formato de 'data_hora' inválido."
        });
      }

      // Evento com duração de 1 hora (3.600.000 ms)
      const dataFim = new Date(dataInicio.getTime() + 60 * 60 * 1000);
      const idAgenda =
        dados.calendar_id ||
        "ef4db9ef39447454cea9c3e6ec534785fc81c39829bbc1645d820b5afa5bfff8@group.calendar.google.com";
      const agenda =
        CalendarApp.getCalendarById(idAgenda) || CalendarApp.getDefaultCalendar();
      const evento = agenda.createEvent(tituloEvento, dataInicio, dataFim, {
        description: descricao
      });

      return responderJSON({
        success: true,
        eventId: evento.getId(),
        titulo: evento.getTitle(),
        inicio: dataInicio.toISOString(),
        fim: dataFim.toISOString()
      });
    }

    // ------------------------------------------------------------------------
    // ROTA B: CRIAÇÃO DE PASTA NO GOOGLE DRIVE (Módulo de Imóveis)
    // ------------------------------------------------------------------------
    const nomeImovel = (dados.titulo || dados.nome || "").toString().trim();
    if (!nomeImovel) {
      return responderJSON({
        success: false,
        error: "O título/nome do imóvel é obrigatório."
      });
    }

    let pastaMae;
    if (PASTA_RAIZ_ID && PASTA_RAIZ_ID.trim() !== "") {
      pastaMae = DriveApp.getFolderById(PASTA_RAIZ_ID.trim());
    } else {
      const iterador = DriveApp.getFoldersByName(NOME_PASTA_PADRAO);
      pastaMae = iterador.hasNext()
        ? iterador.next()
        : DriveApp.createFolder(NOME_PASTA_PADRAO);
    }

    const dataFormatada = Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
    const nomePastaFinal = `${nomeImovel} (${dataFormatada})`;

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

function responderJSON(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
