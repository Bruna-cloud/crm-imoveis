/**
 * ============================================================================
 * GOOGLE APPS SCRIPT - WEBHOOK GOOGLE CALENDAR (AGENDAMENTO DE VISITAS)
 * Andressa Spagnol Imóveis - CRM Imobiliário
 * ============================================================================
 *
 * Recebe um JSON do front-end contendo `titulo` e `data_hora` (ISO 8601 / datetime-local)
 * e cria automaticamente um evento de 1 hora na agenda padrão do Google Calendar.
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responderJSON({
        success: false,
        error: "Payload vazio ou inválido."
      });
    }

    const dados = JSON.parse(e.postData.contents);
    const titulo = (dados.titulo || "").toString().trim();
    const dataHoraStr = (dados.data_hora || "").toString().trim();
    const descricao = (dados.descricao || "Agendado via CRM Andressa Spagnol Imóveis").toString().trim();

    if (!titulo || !dataHoraStr) {
      return responderJSON({
        success: false,
        error: "Os campos 'titulo' e 'data_hora' são obrigatórios."
      });
    }

    // Converte a data/hora recebida em objeto Date (início) e adiciona 1 hora (fim)
    const dataInicio = new Date(dataHoraStr);
    if (isNaN(dataInicio.getTime())) {
      return responderJSON({
        success: false,
        error: "Formato de data_hora inválido."
      });
    }

    const dataFim = new Date(dataInicio.getTime() + 60 * 60 * 1000); // +1 hora

    // Cria o evento na agenda padrão do usuário autenticado no Apps Script
    const agenda = CalendarApp.getDefaultCalendar();
    const evento = agenda.createEvent(titulo, dataInicio, dataFim, {
      description: descricao
    });

    return responderJSON({
      success: true,
      eventId: evento.getId(),
      titulo: evento.getTitle(),
      inicio: dataInicio.toISOString(),
      fim: dataFim.toISOString()
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
