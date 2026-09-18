function responderBotWeb(token, pregunta) {
  requireSession(token);

  const apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!apiKey) {
    return 'El asistente no esta configurado. Falta la clave API GROQ.';
  }

  const knowledge = [
    'Informacion de la web EnmovCRM:',
    '- EnmovCRM (MAVIC) es un CRM web para gestionar sesiones de fisioterapia.',
    '- Tiene tres modulos: En Movimiento Sano (Enmov), Navta y Domiciliaciones.',
    '- Los usuarios se autentican con usuario y contrasena.',
    '- Cada usuario tiene un rol: administrador (ve todo) o fisio (solo sus registros).',
    '- Se pueden crear, editar y eliminar registros de sesiones.',
    '- Se pueden generar facturas desde los registros.',
    '- Hay filtros por cliente, fecha, cantidad y forma de pago.',
    '- Existe un calendario de sesiones en el panel lateral.',
    '- Se pueden exportar datos a Excel.',
    '- La aplicacion se actualiza automaticamente al enviar codigo.',
    '- URL de produccion: www.magaliclemente.es/crm'
  ].join('\n');

  // 1) Construir el prompt
  const payloadBase = {
    messages: [
      {
        role: 'system',
        content: 'Eres un asistente de la web EnmovCRM.\n' +
                 'Responde SOLO segun la informacion que te doy.\n' +
                 'Si no esta en la informacion, responde: "No aparece en la web".\n' +
                 'Se breve y claro. Responde en espanol.\n\n' +
                 'Informacion:\n' + knowledge
      },
      {
        role: 'user',
        content: pregunta
      }
    ],
    temperature: 0.5,
    max_tokens: 500
  };

  // 2) Listar modelos activos de GROQ (no adivinar nombres)
  const urlModelos = 'https://api.groq.com/openai/v1/models';
  var modelos = [];
  var ultimoError = '';

  try {
    const resModelos = UrlFetchApp.fetch(urlModelos, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      muteHttpExceptions: true
    });
    const dataModelos = JSON.parse(resModelos.getContentText());
    if (dataModelos.data) {
      modelos = dataModelos.data
        .filter(function (m) {
          return m.object === 'model' &&
                 /(llama|gemma|qwen|mistral|mixtral|gpt|deepseek|phi)-/.test(m.id);
        })
        .map(function (m) { return m.id; });
    }
  } catch (e) {
    Logger.log('No se pudieron listar modelos GROQ: ' + e);
  }

  if (modelos.length === 0) {
    modelos = ['llama-3.1-8b-instant'];
  }

  // 3) Probar en orden hasta que uno responda
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  for (var i = 0; i < modelos.length && i < 6; i++) {
    const payload = {
      model: modelos[i],
      messages: payloadBase.messages,
      temperature: 0.5,
      max_tokens: 500
    };

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const data = JSON.parse(response.getContentText());

    if (data.error) {
      ultimoError = data.error.message || JSON.stringify(data.error);
      Logger.log('GROQ ' + modelos[i] + ': ' + ultimoError);
      continue;
    }

    const texto = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content
      : 'No pude generar una respuesta.';
    Logger.log('GROQ modelo usado: ' + modelos[i]);
    return texto;
  }

  return 'No se pudo conectar con GROQ. Error de la API: ' + ultimoError;
}
