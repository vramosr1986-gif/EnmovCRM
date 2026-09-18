function responderBotWeb(token, pregunta) {
  requireSession(token);

  const apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
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
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'Eres un asistente de la web EnmovCRM.\n' +
                 'Responde SOLO segun la informacion que te doy.\n' +
                 'Si no esta en la informacion, responde: "No aparece en la web".\n' +
                 'Sé breve y claro. Responde en español.\n\n' +
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

  const modelos = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'gemma2-9b-it',
    'llama-3.2-3b-preview',
    'mixtral-8x7b-32768'
  ];

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  for (var i = 0; i < modelos.length; i++) {
    payload.model = modelos[i];

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
      Logger.log('GROQ ' + modelos[i] + ' error: ' + (data.error.message || JSON.stringify(data.error)));
      continue;
    }

    const texto = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content
      : 'No pude generar una respuesta.';
    Logger.log('GROQ modelo usado: ' + modelos[i]);
    return texto;
  }

  return 'No se pudo conectar con GROQ: todos los modelos fallaron. Revisa la clave API.';
}