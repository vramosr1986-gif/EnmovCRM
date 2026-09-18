function responderBotWeb(token, pregunta) {
  requireSession(token);

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return 'El asistente no esta configurado. Falta la clave API.';
  }

  const knowledge = `
Informacion de la web:
- EnmovCRM (MAVIC) es un CRM web para gestionar sesiones de fisioterapia.
- Tiene tres modulos: En Movimiento Sano (Enmov), Navta y Domiciliaciones.
- Los usuarios se autentican con usuario y contrasena.
- Cada usuario tiene un rol: administrador (ve todo) o fisio (solo sus registros).
- Se pueden crear, editar y eliminar registros de sesiones.
- Se pueden generar facturas desde los registros.
- Hay filtros por cliente, fecha, cantidad y forma de pago.
- Existe un calendario de sesiones en el panel lateral.
- Se pueden exportar datos a Excel.
- La aplicacion se actualiza automaticamente al enviar codigo.
- URL de produccion: www.magaliclemente.es/crm
`;

  const payload = {
    contents: [{
      parts: [{
        text: 'Eres un asistente de la web EnmovCRM.\n' +
              'Responde SOLO segun la informacion que te doy.\n' +
              'Si no esta en la informacion, responde: "No aparece en la web".\n' +
              'Sé breve y claro. Responde en español.\n\n' +
              'Informacion:\n' + knowledge + '\n\n' +
              'Pregunta del usuario:\n' + pregunta
      }]
    }]
  };

  const modelos = [
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ];

  for (var i = 0; i < modelos.length; i++) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelos[i] + ':generateContent?key=' + apiKey;

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const data = JSON.parse(response.getContentText());

    if (data.error) {
      Logger.log(modelos[i] + ' error: ' + (data.error.message || JSON.stringify(data.error)));
      continue;
    }

    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      return data.candidates[0].content.parts[0].text;
    }
  }

  return 'No se pudo generar una respuesta (todos los modelos estan saturados). Inténtalo en unos minutos.';
}