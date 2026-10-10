// Centro de ayuda, Términos de uso y Política de privacidad (español). Misma estructura que zh-TW.js: secciones con los mismos id, en el mismo orden y con el mismo número de bloques.

export default {
  help: {
    title: 'Centro de ayuda',
    updated: 'Última actualización: 10 de octubre de 2026 (desde Noureon 18.4.0)',
    intro: [
      'Noureon es una aplicación web que reúne modelos de IA de muchos proveedores en un solo espacio de trabajo: chat con varios modelos, Consejo de modelos, investigación profunda, archivos y presentaciones, generación de imágenes, extensiones (habilidades, herramientas de línea de comandos y conectores), memoria y sincronización en la nube. Todo funciona en el navegador y se puede instalar como aplicación. Esta página explica cómo funciona cada función, adónde van tus datos y qué hacer cuando algo falla.',
      'Si no encuentras la respuesta, escribe a support@noureon.com (lo que conviene incluir está en «Contacto e informe de problemas», al final). Los Términos de uso y la Política de privacidad son documentos aparte; léelos antes de usar las funciones en la nube.'
    ],
    sections: [
      {
        id: 'start',
        h: '1. Primeros pasos',
        blocks: [
          'Noureon no ofrece crédito de modelos ni revende su uso: tú aportas una clave de API de cada proveedor que quieras usar y liquidas el coste directamente con el proveedor. El camino más corto:',
          [
            'En la página de inicio de sesión, escribe un nombre y una contraseña para crear una «cuenta local»: sus datos se quedan en este navegador. También puedes vincular un correo o una cuenta de Google en Ajustes → Personalización para usar una cuenta en la nube y la sincronización.',
            'Ve a Ajustes → Gestión de modelos, busca la gestión de claves de API e introduce la clave de al menos un proveedor: Google Gemini, OpenRouter (una clave abre todos los modelos que enruta) o NVIDIA (modelos gratuitos). Configura solo los que vayas a usar.',
            'De vuelta en el chat, elige un modelo junto al cuadro de mensaje, escribe un mensaje y envíalo. Sin clave, el cuadro de mensaje te recuerda que primero la añadas en Ajustes.'
          ],
          'Por defecto las claves se quedan en tu navegador y no se suben. Solo si eliges que las respuestas las haga el servidor se envían, cifradas y de forma temporal, al servidor de Noureon (consulta «Ejecución en el servidor» y la Política de privacidad). No envíes nunca una clave, una contraseña de sincronización ni datos de recuperación a nadie, tampoco al soporte.'
        ]
      },
      {
        id: 'accounts',
        h: '2. Cuentas, inicio de sesión y recuperación',
        blocks: [
          [
            'Cuenta local: se crea en la página de inicio de sesión con un nombre y una contraseña; sus datos viven solo en este navegador. Si borras los datos del navegador o cambias de navegador o de dispositivo, no los verás, así que exporta una copia de seguridad de vez en cuando.',
            'Cuenta en la nube: vincula un correo (contraseña de al menos 8 caracteres, que se verifica desde tu bandeja de entrada) o una cuenta de Google; puedes vincular ambos. Necesitas una cuenta en la nube para la sincronización, la ejecución en el servidor, el almacenamiento de habilidades en la nube y las credenciales seguras.',
            'El registro, el inicio de sesión y la recuperación de contraseña muestran una comprobación anti-bots de Cloudflare Turnstile, que frena los abusos automatizados.'
          ],
          'Contraseña de inicio de sesión olvidada: elige «olvidé mi contraseña» en la pantalla de inicio; llega un código de 8 dígitos a tu bandeja, lo introduces y estableces una contraseña nueva. Contraseña de sincronización olvidada: elige la recuperación por correo; llega un enlace que debes abrir en el mismo navegador desde el que lo pediste. También recibes un correo cuando se añade un método de inicio de sesión (por ejemplo, Google) o se cambia la contraseña; si no fuiste tú, cambia la contraseña de inmediato y avísanos.',
          'Para eliminar una cuenta en la nube y todo lo que contiene, escribe a support@noureon.com desde el correo con el que te registraste; lo gestionamos según las reglas de conservación y eliminación de la Política de privacidad.'
        ]
      },
      {
        id: 'chat',
        h: '3. Chat y organización',
        blocks: [
          [
            'Elegir un modelo: el selector junto al cuadro de mensaje lista todos los modelos disponibles (ahora 38 opciones de 14 proveedores), con búsqueda y agrupación por proveedor; los modelos que admiten niveles de razonamiento muestran un control deslizante.',
            'El cuadro de mensaje: pega texto, adjunta archivos, haz una foto, dicta por voz, elige una habilidad con / y una herramienta de línea de comandos con @. El cuadro se puede ampliar a una ventana grande.',
            'Nouras: asistentes de IA reutilizables con su propio nombre, descripción, instrucciones y avatar. Elige Nouras oficiales en la tienda, crea los tuyos, propón un Noura nuevo o comparte uno con otra persona mediante transferencia directa entre dispositivos.',
            'Carpetas, archivo y papelera: las conversaciones pueden ir a carpetas (con color e icono propios), archivarse o moverse a la papelera; puedes seleccionar y mover varias a la vez; la papelera permite restaurar o eliminar para siempre.',
            'Chat temporal: lo usas y te vas; no queda ningún registro, y la respuesta se hace en tu dispositivo, nunca en el servidor.',
            'Buscar en el historial: por palabra clave del título, palabra clave del contenido o lenguaje natural; una línea de tiempo permite saltar a un mensaje de una conversación larga.',
            'Panel personal: total de conversaciones, número de carpetas, modelo más usado, reparto de uso por modelo y distribución de mensajes en el tiempo, todo calculado en tu dispositivo.',
            'Funciones inteligentes: en Ajustes puedes activar o desactivar el «nombre automático de conversaciones» y la «búsqueda inteligente».'
          ]
        ]
      },
      {
        id: 'council',
        h: '4. Consejo de modelos',
        blocks: [
          'El Consejo de modelos hace que de 2 a 5 modelos den cada uno su opinión sobre la misma pregunta, y un sintetizador que eliges escribe una sola respuesta.',
          [
            'Modo consenso: cada miembro responde de forma independiente y el sintetizador lo reúne. Modo debate: los miembros responden primero por separado, luego revisan tras leerse entre sí, y el sintetizador escribe la conclusión.',
            'La respuesta incluye una tabla de «consenso y diferencias»: quién estuvo de acuerdo, quién se reservó y cómo se resolvió.',
            'Cuando conviene, el consejo busca una sola vez en común y todos los miembros hablan a partir del mismo «paquete de búsqueda compartido». Los adjuntos que un miembro no puede leer los convierte antes en un paquete de texto el modelo de «traducción de documentos del consejo» que fijas en Ajustes.',
            'Un conjunto de miembros se puede guardar como grupo y aplicarse después.',
            'Por defecto el consejo se celebra en el servidor de Noureon y termina aunque cierres la página; si eliges ejecutar solo en tu dispositivo, se celebra en el navegador. Cada llamada a un modelo espera como máximo 30 minutos; un miembro que se queda sin tiempo cuenta como fallido y los demás continúan.'
          ]
        ]
      },
      {
        id: 'research',
        h: '5. Investigación profunda',
        blocks: [
          'La investigación profunda sirve para preguntas que exigen buscar mucho y obtener un informe con sus fuentes. Se inicia desde el menú del cuadro de mensaje.',
          [
            'Primero el plan: el modelo redacta un plan de investigación (hasta 8 puntos) y empieza una cuenta atrás de 60 segundos en la que puedes cambiar los puntos; mientras editas, espera como máximo 10 minutos. Al acabar la cuenta atrás empieza sola.',
            'Punto por punto: por cada punto busca, lee páginas, contrasta y toma notas. Una investigación usa como máximo unas 300 llamadas (búsquedas, páginas abiertas, consultas dentro de una página) y como máximo 60 minutos de tiempo de investigación.',
            'Progreso visible: la tarjeta muestra en directo los puntos terminados, el porcentaje, el número de búsquedas y el tiempo empleado, y puedes abrir las fuentes y la actividad.',
            'Puedes pausar, detener o enviar un mensaje con instrucciones adicionales; una pausa dura como máximo 24 horas; la investigación entera, como máximo unas 26 horas.',
            'La investigación se ejecuta en el servidor de Noureon: cierra la pestaña o bloquea el teléfono y, al volver, el resultado ya está en la conversación. Tras un reinicio del servidor continúa desde su último punto de control.',
            'El resultado es un informe con citas y gráficos: vista previa en el chat o lectura a pantalla completa (índice, tarjetas de citas, paneles de fuentes y actividad) y exportación a PDF, Word o Markdown; el archivo se crea en el momento de exportar.'
          ],
          'La investigación necesita un servicio de búsqueda web: los modelos Gemini pueden usar su búsqueda integrada; para los demás modelos, introduce una clave de Tavily o TinyFish en «Búsqueda web» de Ajustes. Un informe puede contener datos erróneos o desactualizados; comprueba los hechos importantes en las fuentes citadas.'
        ]
      },
      {
        id: 'search',
        h: '6. Búsqueda web',
        blocks: [
          [
            'Los modelos Gemini pueden usar su búsqueda integrada. Los modelos de OpenRouter y NVIDIA usan el servicio Tavily o TinyFish que elijas: en Ajustes → Gestión de modelos → Búsqueda web elige la fuente e introduce la clave; Tavily ofrece profundidad básica o avanzada, y TinyFish sirve también para leer las direcciones que pegues.',
            'Con la «búsqueda inteligente» activada, Noureon decide si un mensaje debe buscar antes en la web; con una clave de OpenRouter, un pequeño modelo de criterio ayuda a decidir (lo que recibe está en la Política de privacidad), y si falla o tarda, la aplicación usa sus propias listas de palabras.',
            'Cuando un modelo no tiene capacidad de herramientas, el servidor hace antes la búsqueda y entrega las páginas encontradas al modelo como «paquete de búsqueda»; en Ajustes también puedes hacer que las búsquedas se hagan solo en tu dispositivo.',
            'Las fuentes citadas en una respuesta van numeradas, con el nombre del sitio y su pequeño icono al lado.'
          ]
        ]
      },
      {
        id: 'attachments',
        h: '7. Adjuntos, cámara y voz',
        blocks: [
          [
            'Adjuntos: imágenes, documentos, audio y vídeo. Que un modelo pueda leerlos directamente depende del modelo y del proveedor; un documento que el modelo no puede leer se puede convertir antes en texto detallado con el «modelo de traducción de documentos para un solo modelo» de Ajustes, solo para esa petición.',
            'Cámara: haz una foto y adjúntala directamente.',
            'Entrada de voz: pulsa el micrófono, una onda muestra tu voz, pulsa la marca para terminar o la cruz para descartar. Tu navegador convierte la voz en texto y puede pasar el audio a tu sistema operativo o a un servicio de voz en línea; Noureon no guarda una grabación aparte. Esto se explica la primera vez que la usas.'
          ],
          'Una petición tiene un límite de tamaño (el servidor acepta peticiones de hasta 25 MB); envía los adjuntos muy grandes por partes.'
        ]
      },
      {
        id: 'files',
        h: '8. Archivos y presentaciones',
        blocks: [
          'Pide al modelo en el chat que cree archivos: presentaciones (PPTX), Word (DOCX), Excel (XLSX), PDF y una docena más de formatos, como CSV, calendarios y subtítulos.',
          [
            'Los archivos aparecen como tarjetas; cada uno se puede previsualizar y descargar, y varios se pueden agrupar en un ZIP.',
            'Hay 20 diseños de presentación y 9 estilos de documento para elegir; el modelo también puede seguir un estilo que describas.',
            'Revisión visual: cuando la presentación está hecha, cada diapositiva se puede dibujar como imagen para que un modelo de tu elección vuelva a revisar la maquetación y la corrija si hace falta; activa o desactiva la revisión visual automática en Ajustes. Las imágenes no se guardan.',
            'Los archivos se crean en tu navegador (o en el entorno aislado del servidor); con una cuenta en la nube, los archivos creados se guardan en tu propio almacenamiento en la nube.'
          ]
        ]
      },
      {
        id: 'images',
        h: '9. Generación de imágenes',
        blocks: [
          [
            'Los modelos que admiten generación de imágenes (ahora 4 modelos de imagen, entre ellos GPT Image, FLUX y Nano Banana) pueden dibujar en el chat, aceptan imágenes de referencia, proporción y calidad, y permiten seguir retocando después.',
            'Las imágenes se pueden previsualizar, descargar, reutilizar o abrir en el flujo de edición de imágenes.',
            'Por defecto las imágenes las hace el servidor y terminan aunque cierres la página; si el servidor se reinicia mientras se dibuja una, la petición puede enviarse otra vez al proveedor, y el proveedor puede cobrar dos veces. Si eliges ejecutar solo en tu dispositivo, usas un chat temporal o no has iniciado sesión, las imágenes se hacen en el navegador.'
          ]
        ]
      },
      {
        id: 'advanced',
        h: '10. Modo avanzado (entorno aislado de Python)',
        blocks: [
          'El modo avanzado deja que el modelo escriba Python para procesar datos, trazar gráficos y crear archivos. El código se ejecuta en un entorno aislado:',
          [
            'Ejecutado por el servidor: el código y los archivos adjuntos van al servidor de entorno aislado de Noureon y se ejecutan en un contenedor sin red y con memoria y CPU limitadas, que se elimina al terminar la respuesta; los archivos creados se guardan en tu almacenamiento en la nube y se listan en la respuesta.',
            'Ejecutado en el navegador: el código se ejecuta en una página aislada (run.noureon.com) con Pyodide, que se carga desde jsDelivr.',
            'Cuando el entorno aislado falla, se reintenta la conexión y, si hace falta, el trabajo se devuelve al navegador.'
          ],
          'El almacenamiento en la nube está limitado a 500 MB por usuario (adjuntos y archivos creados juntos; Ajustes muestra el uso); los archivos a los que ya no remite ninguna conversación (por ejemplo, tras eliminar una conversación) se eliminan automáticamente al cabo de un día aproximadamente.'
        ]
      },
      {
        id: 'extensions',
        h: '11. Extensiones: habilidades, herramientas de línea de comandos y conectores',
        blocks: [
          'La página Extensiones (barra lateral izquierda, o lista izquierda en el ordenador) tiene tres partes.',
          [
            'Habilidades: una forma de trabajo ya escrita (SKILL.md: nombre, descripción, texto). Hay 11 habilidades oficiales (incluida la habilidad oficial para crear habilidades). Escribe / en el cuadro de mensaje y elige una habilidad, y esa respuesta la seguirá; el modelo también puede decidir por sí mismo: solo ve el nombre y una línea de cada habilidad permitida, y carga el texto completo cuando lo necesita (como máximo 5 por respuesta; cada habilidad tiene un interruptor «permitir que el modelo la use por sí mismo»).',
            'Tus propias habilidades: pega texto o sube un zip (SKILL.md con notas, scripts y recursos; hasta 5 MB y 60 archivos; se comprueba en el navegador y otra vez en el servidor, que rechazan programas e instaladores, enlaces y rutas inseguras). Hasta 50 habilidades. También puedes pedir al modelo que te ayude a crear una; el borrador se muestra como tarjeta y solo se guarda cuando lo confirmas.',
            'Habilidades con scripts: un script solo se ejecuta cuando el modelo lo ejecuta de forma explícita, en un contenedor aislado del servidor (la carpeta de la habilidad es de solo lectura y no ejecutable, y por defecto no hay red); los chats temporales no ofrecen habilidades con scripts.',
            'Herramientas de línea de comandos: 8 herramientas oficiales (por ejemplo, Pandoc, FFmpeg, yt-dlp, csvkit), que se ejecutan en un contenedor aislado del servidor. Actívalas en la página Extensiones y luego elige una con @, o permite que el modelo las use por sí mismo. El programa de una herramienta lo descarga el anfitrión del entorno aislado desde su versión oficial (GitHub) y lo comprueba con un hash fijo.',
            'Conexiones a sitios y consentimiento: siempre que una herramienta necesita un sitio web, la conexión pasa por un proxy de filtrado del servidor, que solo abre los puertos 80 y 443 y nunca llega al propio servidor ni a su red interna. Cada sitio se trata según tus reglas en Ajustes → Permisos: permitir, preguntar o rechazar; de un sitio sin regla se pregunta en la conversación, y no responder en 10 minutos cuenta como rechazo.',
            'Credenciales seguras: cuando una herramienta necesita iniciar sesión (por ejemplo, la cookie de acceso de una cuenta), una ventana te la pide y se guarda cifrada en el servidor; puedes verla, sustituirla o eliminarla en cualquier momento en Ajustes → Permisos. El modelo nunca ve el valor, y una credencial en la salida de un comando se oculta.',
            'Conectores: inicia sesión en tu propia cuenta de un servicio y el modelo podrá leer lo que es tuyo allí y, si lo permites, modificarlo (por ahora Notion, Linear, Context7, Upstash, Vercel y GitHub). El inicio de sesión se hace en la página del propio servicio; Noureon nunca ve tu contraseña y el acceso se guarda cifrado en el servidor. En Extensiones → Conectores ajustas cada herramienta en permitir, preguntar cada vez o rechazar: las de lectura empiezan en permitir y las de escritura en preguntar. Una herramienta que pregunta muestra en la conversación una tarjeta con sus parámetros exactos y tres respuestas (permitir una vez, permitir siempre, rechazar); sin respuesta en 10 minutos se considera rechazada. Cuando el servicio lo permite (Linear) puedes elegir una conexión de solo lectura; la página de acceso de Upstash tiene su propio interruptor de solo lectura, que decides si activar; Context7 solo consulta documentación y no tiene ninguna herramienta que cambie nada. Una respuesta hace como máximo 30 llamadas a servicios. Los conectores solo se usan en respuestas hechas por el servidor, no en conversaciones temporales; lo que el modelo lee de un servicio va al proveedor de modelos que elegiste.'
          ],
          'Cuando una herramienta obtiene contenido de sitios web, respeta las condiciones y las normas de derechos de autor de esos sitios; consulta los Términos de uso.'
        ]
      },
      {
        id: 'server',
        h: '12. Ejecución en el servidor y cerrar la pestaña',
        blocks: [
          'Cuando has iniciado sesión en una cuenta en la nube, las respuestas las hace por defecto el servidor de Noureon, así que cerrar la pestaña o bloquear el teléfono no las detiene y, al volver, el resultado ya está en el chat. Esto abarca las respuestas normales, el Consejo de modelos, la investigación profunda, la generación de imágenes, la búsqueda web, el modo avanzado y la revisión visual.',
          [
            'Para hacer las respuestas solo en tu dispositivo: Ajustes → Privacidad, elige «Este dispositivo».',
            'Los chats temporales, los usuarios sin sesión iniciada y las respuestas que necesitan el navegador (entrada de voz, cámara) se hacen siempre en tu dispositivo.',
            'Una respuesta puede ejecutarse como máximo 2 horas; como máximo 5 a la vez; como máximo 10 nuevas por minuto.',
            'Para la respuesta, tu clave de API se guarda cifrada un breve tiempo y se elimina al terminar (como máximo 2 h 15 min para una respuesta normal, 30 minutos para una imagen, 27 horas para una investigación profunda); nunca se guarda a largo plazo ni se escribe en registros.',
            'Con varias pestañas abiertas, la respuesta se muestra en directo en todas; una conexión perdida se restablece sola.'
          ]
        ]
      },
      {
        id: 'memory',
        h: '13. Memoria y recuerdo entre conversaciones',
        blocks: [
          [
            'Preferencias personales confirmadas: en Ajustes → Gestión de memoria puedes añadirlas, sustituirlas o eliminarlas tú mismo, y añadir reglas de «no mencionar», por ejemplo no hablar de tu nombre ni de tu información de salud.',
            'Memoria automática: cuando está activada, Noureon usa tu clave de Gemini para convertir las conversaciones en resúmenes y posibles preferencias que tú confirmas; desactivarla solo detiene los recuerdos nuevos, los confirmados se quedan y se eliminan uno por uno.',
            'Recuerdo entre conversaciones: requiere tu consentimiento explícito. Activado, este dispositivo envía tu pregunta actual a Gemini Embedding 2 y usa un índice local para encontrar hasta tres resúmenes pertinentes de conversaciones anteriores; las fuentes no se muestran en el chat. El consentimiento sigue a tu cuenta en todos los dispositivos, pero el índice y los vectores no se sincronizan: cada dispositivo construye los suyos; puedes comprobar u optimizar el índice local en Ajustes.',
            'Las imágenes, vídeos, audios y documentos adjuntos pueden resumirse mediante la función de archivos de Gemini cuando se construye la memoria.'
          ]
        ]
      },
      {
        id: 'data',
        h: '14. Datos, sincronización, exportación y eliminación',
        blocks: [
          [
            'Primero en local: las conversaciones, carpetas, archivo, ajustes, Nouras, claves de API, preferencias de apariencia y el índice de memoria se guardan por defecto en tu navegador. Borrar los datos del navegador puede eliminarlos.',
            'Sincronización en la nube: se activa en Ajustes → Personalización tras vincular un correo o una cuenta de Google. Incluye conversaciones y mensajes, carpetas, Nouras, recuerdos y registros de resumen, metadatos de sincronización, marcas de eliminación y los archivos que subes o creas. Para sincronizar claves de API debes crear antes una contraseña de sincronización (de al menos 10 caracteres); las claves y otros datos sensibles se cifran con ella antes de subirse.',
            'Guarda tú mismo la contraseña de sincronización: tras borrarla, los datos cifrados existentes no se pueden descifrar. La propia contraseña de sincronización se guarda cifrada con una clave del servidor, para la recuperación entre dispositivos y por correo.',
            'Exportar e importar (Ajustes → Gestión de datos): exporta .json o .zip (historial de conversaciones con archivo y carpetas, Nouras, ajustes de la aplicación, preferencias personales confirmadas; las claves de API necesitan una contraseña de sincronización para exportarse de forma segura). Importar sustituye tus datos actuales, así que comprueba antes. Revisa un archivo exportado antes de compartirlo, sobre todo si decidiste incluir datos sensibles.',
            'Transferencia directa entre dispositivos: en Ajustes, «Sincronización entre dispositivos (P2P)», elige «Quiero enviar» o «Quiero recibir», conéctate con un código de 8 caracteres o escaneando un código QR, y los elementos elegidos van directamente entre los dos dispositivos; así también se pueden compartir Nouras.',
            'Almacenamiento: los adjuntos en la nube y los archivos creados juntos están limitados a 500 MB por usuario; las imágenes generadas no se detienen por ese límite.',
            'Zona de peligro: «Borrar todos los registros y datos» elimina para siempre todo lo que hay en este navegador y no se puede deshacer. Cuando has iniciado sesión y sincronizas, las eliminaciones y restauraciones también se sincronizan con la nube.'
          ]
        ]
      },
      {
        id: 'appearance',
        h: '15. Apariencia, idioma e instalación',
        blocks: [
          [
            'Apariencia: claro, oscuro o según el sistema, con un color de acento; la página de inicio antes de iniciar sesión también tiene un botón de claro/oscuro arriba a la derecha.',
            'Idioma: la interfaz está disponible en chino tradicional, inglés, francés, ruso y español, y se cambia en Ajustes → Personalización; el «idioma de respuesta predeterminado de la IA» fija el idioma en que responde la IA, salvo que pidas otro en una conversación.',
            'Accesibilidad: Ajustes tiene opciones de accesibilidad.',
            'Instalar como aplicación: Noureon es una aplicación web progresiva (PWA); usa «Añadir a la pantalla de inicio» o «Instalar» en tu navegador. Sin conexión solo funciona la propia aplicación en caché; lo que necesita un modelo o la nube sigue necesitando red.',
            'Avisos de actualización: cuando hay una versión nueva puede aparecer un aviso (se desactiva en Ajustes); el historial completo de actualizaciones está en noureon.com/updates.'
          ]
        ]
      },
      {
        id: 'troubleshooting',
        h: '16. Solución de problemas',
        blocks: [
          [
            'No hay respuesta tras enviar: comprueba que la clave del proveedor de ese modelo es correcta y tiene saldo, y prueba con otro modelo. Gemini, OpenRouter y NVIDIA tienen cada uno sus mensajes de error y sus reglas de cuota.',
            'Una respuesta es lenta o se corta: las respuestas largas, la investigación profunda y el consejo llevan tiempo; cuando los ejecuta el servidor, puedes irte y volver. El servidor permite 5 respuestas a la vez y 10 nuevas por minuto por persona.',
            'La sincronización no se actualiza: comprueba que has iniciado sesión, que la contraseña de sincronización está desbloqueada (introdúcela si hace falta en la zona de sincronización en la nube de Ajustes) y que la red funciona, y pulsa «Sincronizar ahora». Los cambios sin conexión se sincronizan cuando vuelve la conexión.',
            'Contraseña de sincronización olvidada: recupérala por correo (consulta «Cuentas, inicio de sesión y recuperación»). Si la contraseña de sincronización se borró, los datos cifrados antiguos no se pueden descifrar.',
            'Faltan datos: comprueba si cambiaste de navegador o de dispositivo o borraste los datos del navegador; los datos de una cuenta local solo existen en el navegador donde se crearon. Busca las conversaciones eliminadas en la papelera, o importa una copia de seguridad exportada antes.',
            'El modo avanzado o una herramienta de línea de comandos falla: el entorno aislado a veces falla por conexión o por límites de recursos, y Noureon reintenta por sí mismo; si sigue fallando, pídelo de otra manera o reduce el tamaño de los archivos.',
            'Un archivo o una presentación se ve mal: compruébalo en la vista previa; pide al modelo que ajuste la maquetación, o activa la revisión visual para que un modelo lo revise.',
            'La página se comporta de forma extraña: recárgala y, si hace falta, borra la caché de este sitio y vuelve a cargarla; si persiste, infórmanos.'
          ]
        ]
      },
      {
        id: 'contact',
        h: '17. Contacto e informe de problemas',
        blocks: [
          [
            'Correo: support@noureon.com, para dudas sobre la cuenta, el inicio de sesión, la sincronización, el correo, los datos y el uso.',
            'Incluye, por favor: tu navegador y dispositivo (por ejemplo, iPhone Safari 18), el modelo o proveedor usado, cuándo ocurrió, qué hiciste y una captura de pantalla o el error de la consola.',
            'No envíes nunca claves de API, contraseñas de sincronización, datos de recuperación ni ninguna credencial de acceso.',
            'Comentarios: el formulario de comentarios de Ajustes solo se envía cuando el operador ha configurado un punto de recepción; las propuestas de Noura llegan a los desarrolladores del mismo modo.',
            'Cuenta oficial de X: @NoureonAi (https://x.com/NoureonAi).',
            'Código fuente e incidencias: https://github.com/NHZallen/Noureon; puedes informar de problemas o hacer sugerencias en GitHub.'
          ]
        ]
      },
      {
        id: 'opensource',
        h: '18. Código abierto y software de terceros',
        blocks: [
          'El código fuente de Noureon es público en GitHub con licencia MIT; puedes leerlo línea a línea o alojarlo tú mismo. Si lo alojas, no subas nunca al repositorio claves reales de proveedores, credenciales SMTP, claves de servicio de Supabase ni otros secretos; usa variables de entorno.',
          'Noureon usa mucho software de terceros (por ejemplo, Python y sus bibliotecas en el entorno aislado, las herramientas de línea de comandos y las bibliotecas de la propia aplicación), cada uno con su propia licencia; la lista completa está enlazada como «Software de terceros y licencias» en la página Extensiones.'
        ]
      }
    ]
  },

  terms: {
    title: 'Términos de uso',
    updated: 'Última actualización: 10 de octubre de 2026 (desde Noureon 18.4.0)',
    intro: [
      'Te damos la bienvenida a Noureon. Estos términos fijan los derechos y deberes de ambas partes cuando usas el servicio Noureon en noureon.com («el servicio»). Al usar el servicio confirmas que has leído y aceptas estos términos y la Política de privacidad; si no estás de acuerdo, no uses el servicio.',
      'Los términos los ofrece el equipo que opera Noureon («nosotros»). El código fuente de Noureon se publica aparte con licencia MIT; estos términos rigen el servicio que operamos y no cambian los derechos que esa licencia de código abierto te da.'
    ],
    sections: [
      {
        id: 'service',
        h: '1. Qué es el servicio',
        blocks: [
          'Noureon es un espacio de trabajo de IA: con tus propias claves de API usas modelos de IA de varios proveedores en una sola interfaz, y ofrece el Consejo de modelos, la investigación profunda, la búsqueda web, el análisis de adjuntos, la creación de archivos y presentaciones, la generación de imágenes, el modo avanzado (un entorno aislado de Python), extensiones (habilidades, herramientas de línea de comandos y conectores), Nouras, carpetas y búsqueda, memoria, importación y exportación, transferencia directa entre dispositivos, instalación como PWA, y sincronización en la nube y ejecución en el servidor opcionales.',
          'Un hecho importante: Noureon no proporciona ni revende el acceso a ningún modelo ni su uso. Los modelos los proporcionan los proveedores externos de IA y de búsqueda que elijas, y liquidas el coste directamente con ellos.'
        ]
      },
      {
        id: 'accounts',
        h: '2. Cuentas y responsabilidad sobre los datos',
        blocks: [
          [
            'Puedes usar solo una cuenta local (sus datos se quedan en este navegador) o vincular un correo o una cuenta de Google para usar una cuenta en la nube. Facilita información correcta y responde de lo que ocurra bajo tu cuenta.',
            'Guarda tú mismo con seguridad tu contraseña de inicio de sesión, tu contraseña de sincronización, los datos de recuperación y tus claves de API. Una vez borrada o perdida una contraseña de sincronización, los datos cifrados existentes pueden no poder descifrarse y no podemos restaurarlos por ti.',
            '«Primero en local» significa que tu dispositivo controla los datos, y también que las copias de seguridad son tu responsabilidad: borrar los datos del navegador o cambiar de dispositivo o de navegador puede hacer desaparecer los datos locales, así que exporta una copia de vez en cuando.',
            'No puedes transferir tu cuenta a otra persona ni crear cuentas en masa mediante automatización.',
            'Una cuenta es para una persona; si la usas en nombre de una organización, asegúrate de estar autorizado a hacerlo.'
          ]
        ]
      },
      {
        id: 'content',
        h: '3. Tu contenido y tus derechos',
        blocks: [
          [
            'Las peticiones que escribes, los archivos que subes, los Nouras, habilidades y recuerdos que creas y los resultados que obtienes te pertenecen a ti o a sus titulares originales; no afirmamos ser sus propietarios.',
            'Nos autorizas a tratar este contenido en la medida necesaria para ofrecer las funciones que usas, por ejemplo guardarlo en tu espacio en la nube, enviarlo al proveedor que elegiste, ejecutarlo en el entorno aislado, crear archivos o resúmenes. No usamos tu contenido para otros fines y no vendemos datos personales (consulta la Política de privacidad).',
            'Debes asegurarte de tener derecho a usar lo que subes o nos pides tratar (incluidas obras ajenas, datos personales e información confidencial) y asumes la responsabilidad que de ello se derive.',
            'Los resultados de la IA pueden parecerse a los que reciben otras personas; no prometemos que un resultado sea original ni que no infrinja derechos de terceros.'
          ]
        ]
      },
      {
        id: 'ai',
        h: '4. Límites de las respuestas de la IA',
        blocks: [
          [
            'Las respuestas de la IA, los informes de investigación profunda, las conclusiones del consejo, los archivos, imágenes y código generados pueden ser erróneos, incompletos, desactualizados, sesgados o inadecuados para un fin. Las fuentes citadas también pueden malinterpretarse o dejar de estar disponibles.',
            'No los trates como única base de decisiones médicas, legales, financieras, de seguridad, de salud mental u otras de alto riesgo; confirma lo importante con un profesional cualificado. Los Nouras de Noureon relacionados con la salud mental no son profesionales humanos y no diagnostican; en una emergencia, contacta con los servicios de emergencia locales.',
            'El acuerdo entre varios modelos no hace que algo sea correcto, y las comprobaciones automáticas como la revisión visual no pueden prometer que no haya errores. Comprueba tú mismo cada resultado, sobre todo antes de publicarlo, entregarlo o ejecutarlo.',
            'Tú decides si usar un resultado de la IA y eres responsable de lo que se derive de usarlo.'
          ]
        ]
      },
      {
        id: 'providers',
        h: '5. Proveedores, claves y costes',
        blocks: [
          [
            'Usar el servicio exige que obtengas claves de API de proveedores externos (por ejemplo, Google Gemini, OpenRouter, NVIDIA, Tavily, TinyFish) y cumplas los términos de servicio, políticas de uso y política de privacidad de cada uno. Lo que envías se trata según las reglas de esos proveedores, que no controlamos; no somos responsables de la calidad, disponibilidad, políticas de contenido ni cambios de precio de sus servicios.',
            'Todos los costes de modelos y de búsqueda te los cobran los proveedores. Vigila tú mismo tu saldo y tu facturación, y te sugerimos fijar un límite de uso en el proveedor.',
            'Cuando el servidor hace una respuesta, tu clave se guarda cifrada un breve tiempo y se usa para llamar al proveedor en tu nombre y completar esa respuesta (el tiempo está en la Política de privacidad). Si el servidor se reinicia durante una imagen o la síntesis de un consejo, una petición puede enviarse de nuevo y el proveedor puede cobrar dos veces; no reembolsamos esos costes.',
            'El servicio también puede usar otra infraestructura de terceros, por ejemplo Supabase (cuentas y almacenamiento de base de datos), Cloudflare (comprobaciones anti-bots), GitHub (programas e iconos de las herramientas de línea de comandos) y Vercel (alojamiento web).'
          ]
        ]
      },
      {
        id: 'server',
        h: '6. Ejecución en el servidor y entorno aislado',
        blocks: [
          [
            'Por defecto las respuestas las hace el servidor para que continúen después de cerrar la página. En cualquier momento puedes pasar a hacerlas solo en tu dispositivo en Ajustes → Privacidad.',
            'El servidor y el entorno aislado tienen límites, para mantener estable el servicio: una respuesta se ejecuta como máximo 2 horas, 5 a la vez por persona, 10 nuevas por minuto, peticiones de hasta 25 MB, la investigación profunda hasta unas 26 horas, una llamada a un modelo hasta 30 minutos y el almacenamiento en la nube hasta 500 MB por persona. Los límites pueden cambiar según el estado del servicio.',
            'No prometemos que cada ejecución tenga éxito ni termine en un tiempo determinado. El servidor puede reiniciarse y un proveedor puede fallar; el sistema intenta reintentar o continuar desde un punto de control, pero aun así puede fallar.',
            'El código del entorno aislado se ejecuta en un contenedor aislado sin red, que se elimina al terminar la respuesta. No debes intentar salir del entorno aislado, llegar a otros usuarios o a la red interna, ni usarlo para consumir recursos de cómputo excesivos.'
          ]
        ]
      },
      {
        id: 'extensions',
        h: '7. Habilidades, herramientas de línea de comandos, conectores y código',
        blocks: [
          [
            'Las habilidades que añades tú (incluidas las notas y los scripts de un zip) son responsabilidad tuya. Asegúrate de tener derecho a usar su contenido y de que no contengan código malicioso. Un script solo se ejecuta cuando el modelo lo ejecuta de forma explícita, en el entorno aislado.',
            'Las herramientas de línea de comandos usan las conexiones y credenciales que tú facilitas. Eres responsable de cumplir los términos de uso, las reglas de robots y las normas de derechos de autor de los sitios a los que se conectan, y de descargar, leer o publicar solo lo que tengas derecho a usar.',
            'Las conexiones a sitios se tratan según las reglas que fijes (permitir, preguntar, rechazar). Eres responsable de las conexiones que permitas o confirmes.',
            'No uses herramientas de línea de comandos ni habilidades para nada ilícito, para eludir muros de pago o controles de acceso, para invadir la privacidad de otros, para enviar spam, para atacar otros sistemas ni para extraer datos en masa contra las normas de un sitio.',
            'Las herramientas de línea de comandos y el software del entorno aislado son software de terceros, cada uno con su licencia y su exención de responsabilidad; los obtenemos de la versión oficial y comprobamos el hash, pero no prometemos que carezcan de defectos o de inseguridad.',
            'Usa solo tus propias cuentas para las credenciales seguras que guardes (por ejemplo, cookies de acceso); puedes verlas, sustituirlas o eliminarlas en cualquier momento.',
            'Los conectores actúan sobre tus propias cuentas en otros servicios (por ahora Notion, Linear, Context7, Upstash, Vercel y GitHub). Lo que pueden hacer depende de lo que permitas en los ajustes de las herramientas y de lo que permita el acceso al servicio; eres responsable de lo que permites o confirmas, incluidos los cambios y borrados hechos en esos servicios, y de cumplir sus condiciones de uso. Lo que devuelve un servicio queda fuera de nuestro control y el modelo puede equivocarse o ser engañado por ese contenido, así que revisa una herramienta que modifique o elimine datos antes de permitirla.'
          ]
        ]
      },
      {
        id: 'acceptable',
        h: '8. Conductas prohibidas',
        blocks: [
          'Al usar el servicio no puedes:',
          [
            'infringir la ley ni pedir resultados que ayuden a infringirla.',
            'vulnerar la propiedad intelectual, la privacidad, la reputación u otros derechos de nadie, ni tratar datos personales de otros sin consentimiento.',
            'crear o difundir malware, fraude, phishing, acoso, odio, amenazas de violencia o contenido sexual que involucre a menores.',
            'usar el servicio para dañar a otros, o para crear identidades o información falsas que engañen a las personas.',
            'atacar, sondear o perturbar el servicio, sus servidores, su sistema de cuentas o el entorno aislado, ni intentar eludir los límites de frecuencia, la verificación y las medidas de seguridad.',
            'acceder al servicio mediante automatización más allá del uso normal, ni consumir recursos de una forma que afecte a otros usuarios.',
            'incumplir los términos y las políticas de uso de los proveedores externos que utilizas.'
          ],
          'Si lo haces, podemos limitar o suspender tu acceso, retirar el contenido correspondiente y, cuando sea necesario, colaborar con las investigaciones como exija la ley.'
        ]
      },
      {
        id: 'ip',
        h: '9. Propiedad intelectual y código abierto',
        blocks: [
          [
            'El código fuente de Noureon se publica con licencia MIT; consulta LICENSE en GitHub. Puedes usar, modificar y distribuir el código conforme a esa licencia.',
            'El software de terceros que usa Noureon está bajo sus propias licencias; la lista está en la página Extensiones.',
            'No uses el nombre ni el logotipo de Noureon para sugerir que tu producto o servicio lo proporcionamos, respaldamos o aprobamos nosotros.'
          ]
        ]
      },
      {
        id: 'privacy',
        h: '10. Privacidad',
        blocks: [
          'Cómo tratamos tus datos está escrito en la Política de privacidad, que forma parte de estos términos. En resumen: por defecto, primero en local; lo que envías va a los proveedores que eliges; cuando eliges la sincronización en la nube o la ejecución en el servidor, los datos necesarios se guardan en nuestros servidores o pasan por ellos; no vendemos datos personales ni tenemos publicidad integrada ni seguimiento entre sitios.'
        ]
      },
      {
        id: 'changes',
        h: '11. Cambios, interrupción y fin del servicio',
        blocks: [
          [
            'El servicio está en desarrollo continuo: las funciones, los límites y los proveedores y modelos admitidos pueden añadirse, cambiarse o retirarse, y el servicio puede interrumpirse temporal o definitivamente. Los cambios importantes se escriben en el historial de actualizaciones (noureon.com/updates).',
            'Puedes dejar de usarlo en cualquier momento y exportar o eliminar tus datos; para eliminar una cuenta en la nube, escríbenos como explica el Centro de ayuda.',
            'Si incumples estos términos, pones en peligro el servicio o a otros usuarios, o la ley lo exige, podemos suspender o poner fin a tu acceso.'
          ]
        ]
      },
      {
        id: 'disclaimer',
        h: '12. Exención de garantías',
        blocks: [
          'El servicio se ofrece «tal cual» y «según disponibilidad». En la mayor medida que permita la ley, no damos ninguna garantía, expresa o implícita, de que el servicio sea adecuado para un fin, ininterrumpido, libre de errores, seguro, exacto, completo o no infractor. Esto vale especialmente para los resultados de la IA y los servicios de proveedores externos.'
        ]
      },
      {
        id: 'liability',
        h: '13. Limitación de responsabilidad',
        blocks: [
          [
            'En la mayor medida que permita la ley, no somos responsables de ningún daño indirecto, incidental, especial, consecuente o punitivo derivado del uso o de la imposibilidad de usar el servicio, incluida la pérdida de datos, la pérdida de beneficios, las tarifas de los proveedores y las pérdidas por confiar en un resultado de la IA.',
            'En la mayor medida que permita la ley, nuestra responsabilidad total frente a ti se limita a la cantidad que nos hayas pagado por el servicio; como el servicio actualmente no te cobra, esa cantidad es cero.',
            'La responsabilidad que la ley no permite excluir ni limitar (por ejemplo, la derivada de dolo o negligencia grave, o los derechos que concede la ley local de protección de consumidores) no se ve afectada por esta sección.'
          ]
        ]
      },
      {
        id: 'update',
        h: '14. Cambios en estos términos',
        blocks: [
          'Podemos modificar estos términos. La nueva versión se publica en esta página con la fecha de arriba actualizada, y los cambios importantes también se escriben en el historial de actualizaciones. Si sigues usando el servicio después de que un cambio entre en vigor, aceptas los términos modificados; si no estás de acuerdo, deja de usar el servicio.'
        ]
      },
      {
        id: 'general',
        h: '15. Otros',
        blocks: [
          [
            'Si alguna parte de estos términos se considera inválida o inaplicable, el resto sigue en vigor.',
            'Prevalece la versión en chino tradicional de estos términos; las versiones en otros idiomas son para facilitar la lectura y, si difieren, se aplica la versión en chino tradicional.',
            'Estos términos no sustituyen ningún acuerdo entre tú y un proveedor externo.',
            'Cuando la ley local exija otra cosa, se aplica esa ley.'
          ]
        ]
      },
      {
        id: 'contact',
        h: '16. Contacto',
        blocks: [
          'Para dudas sobre estos términos, escribe a support@noureon.com (sin claves de API ni contraseñas). La cuenta oficial de X es @NoureonAi.'
        ]
      }
    ]
  },

  privacy: {
    title: 'Política de privacidad',
    updated: 'Última actualización: 10 de octubre de 2026 (desde Noureon 18.4.0)',
    intro: [
      'Esta política explica qué datos trata Noureon, dónde se guardan, quién los recibe, durante cuánto tiempo y qué opciones tienes. Abarca los flujos de datos por defecto y los adicionales que aparecen cuando activas la sincronización en la nube, la ejecución en el servidor, la memoria y otras funciones.',
      'En una frase: Noureon es «primero en local» por defecto, así que las conversaciones, los ajustes y las claves se guardan en tu navegador; lo que envías va a los proveedores de IA y de búsqueda que elijas; solo cuando inicias sesión en una cuenta en la nube, activas la sincronización o haces que el servidor ejecute respuestas, los datos necesarios se guardan en los servidores de Noureon o pasan por ellos. No vendemos datos personales ni tenemos publicidad integrada ni seguimiento entre sitios.',
      '«Primero en local» no significa que cada petición de IA se ejecute sin conexión: para obtener una respuesta de la IA, tu contenido tiene que enviarse al proveedor del modelo.'
    ],
    sections: [
      {
        id: 'summary',
        h: '1. Los datos de un vistazo',
        blocks: [
          [
            'En tu navegador: conversaciones, carpetas y archivo, ajustes, Nouras, recuerdos e índice local, claves de API, preferencias de apariencia, datos de la cuenta local.',
            'Enviado a los proveedores de IA y de búsqueda: tus peticiones, el contexto de la conversación, los adjuntos, las instrucciones del sistema y las opciones de modelo que eliges (sección 6).',
            'En la nube de Noureon (cuando inicias sesión y sincronizas): datos del espacio de trabajo (conversaciones, mensajes, carpetas, Nouras, resúmenes de memoria), archivos subidos y generados, una copia cifrada de la contraseña de sincronización, habilidades y paquetes de habilidades, accesos y ajustes de herramientas de los conectores, credenciales seguras (secciones 4 y 8).',
            'Pasando un tiempo por el servidor de Noureon (cuando eliges la ejecución en el servidor): el historial, las instrucciones del sistema y tu clave que necesita esa respuesta, que se eliminan al terminar la respuesta (sección 7).',
            'Infraestructura de terceros: Supabase, Cloudflare Turnstile, GitHub, Vercel, PeerJS y otras (sección 17).'
          ]
        ]
      },
      {
        id: 'controller',
        h: '2. Quién es el responsable y cómo contactarnos',
        blocks: [
          'Noureon lo opera su equipo de desarrollo. Para dudas de privacidad, cuenta, sincronización, correo o datos, escribe a support@noureon.com, sin claves de API, contraseñas de sincronización ni datos de recuperación. La cuenta oficial de X es @NoureonAi. Quien aloje Noureon por su cuenta es el responsable de los datos de ese despliegue y debe describir sus propias prácticas.'
        ]
      },
      {
        id: 'local',
        h: '3. Los datos guardados en tu navegador',
        blocks: [
          [
            'Por defecto, Noureon guarda en el almacenamiento del navegador (IndexedDB y localStorage) las conversaciones y mensajes, carpetas y archivo, ajustes de la aplicación, Nouras, preferencias personales y recuerdos confirmados, el índice local y los vectores del recuerdo entre conversaciones, las claves de API de los proveedores, las preferencias de apariencia, la información de las imágenes generadas y el perfil local.',
            'localStorage guarda además una copia de tu elección de claro/oscuro, para que la página tenga el tema correcto al abrirse.',
            'Las páginas públicas (Centro de ayuda, Términos de uso, Política de privacidad, historial de actualizaciones) también recuerdan en localStorage el idioma que eliges en ellas; no se envía a nadie.',
            'Como PWA, el service worker solo guarda en caché los archivos de la propia aplicación (programas, estilos, iconos), no tus conversaciones ni tus datos personales.',
            'Los datos de conexión de un inicio de sesión en la nube (la sesión) los guarda en el navegador la biblioteca Auth de Supabase.',
            'Borrar los datos del navegador puede eliminar el espacio de trabajo local; los archivos exportados los guardas tú.'
          ],
          'Noureon no usa cookies publicitarias ni de seguimiento y no tiene scripts de análisis de terceros.'
        ]
      },
      {
        id: 'cloud',
        h: '4. Cuentas y sincronización en la nube',
        blocks: [
          [
            'Métodos de inicio de sesión: correo con contraseña, o cuenta de Google. La verificación y el correo los gestiona Supabase Auth; con el inicio de sesión por correo tratamos tu correo y un hash de la contraseña, y con el de Google recibimos los datos básicos que Google facilita (por ejemplo, el correo y el nombre visible). Nunca vemos tu contraseña de Google.',
            'El registro, el inicio de sesión, la recuperación de contraseña y el formulario de comentarios usan Cloudflare Turnstile como comprobación anti-bots, por lo que Cloudflare ve datos del navegador y de la conexión.',
            'El correo que enviamos se usa solo para el acceso y la recuperación de la cuenta: confirmación del registro, restablecimiento de contraseña (un código), el enlace de una contraseña de sincronización olvidada y avisos de que se añadió un método de inicio de sesión o se cambió la contraseña.',
            'Con la sincronización en la nube activada, Supabase guarda lo necesario para la sincronización entre dispositivos: carpetas, conversaciones, mensajes (con sus metadatos), Nouras, recuerdos y registros de resumen de memoria, metadatos de sincronización, marcas de eliminación (lápidas) y los archivos que subes o creas (en Supabase Storage).',
            'La contraseña de sincronización: las claves y otros contenidos sensibles se cifran primero en el navegador con tu contraseña de sincronización antes de entrar en la bóveda en la nube; sin contraseña de sincronización, las claves de API de los proveedores no se suben. La propia contraseña de sincronización se guarda cifrada con una clave del servidor, para la recuperación entre dispositivos y por correo, y la base de datos no guarda texto en claro. Ten en cuenta que esto significa que la recuperación de la contraseña de sincronización se hace con ayuda del servicio; no es cierto en todos los casos que solo tú puedes desbloquearla.',
            'Puedes elegir no iniciar sesión en una cuenta en la nube; entonces ninguno de estos datos sale de tu dispositivo (aparte de las peticiones que envías a los proveedores).'
          ]
        ]
      },
      {
        id: 'providers',
        h: '5. Los proveedores externos que configuras',
        blocks: [
          [
            'Los proveedores que puedes usar incluyen Google Gemini, OpenRouter (que traslada las peticiones a los fabricantes de modelos), NVIDIA API Catalog y los servicios de búsqueda Tavily y TinyFish. Configura solo los que uses.',
            'Estos proveedores tratan tus datos según sus propios términos y políticas de privacidad, incluido si los registran, los conservan o los usan para entrenar; no lo controlamos y te sugerimos revisar los ajustes de cada uno.',
            'Por defecto tus claves se guardan en el navegador y el navegador llama directamente al proveedor, de modo que las peticiones no pasan por el servidor de Noureon; las excepciones son cuando eliges la ejecución en el servidor y los puntos de proxy de este sitio (más abajo).'
          ]
        ]
      },
      {
        id: 'sent',
        h: '6. Lo que se envía a los proveedores',
        blocks: [
          [
            'Cuando envías un mensaje, el contenido necesario de la petición, el contexto de la conversación, los adjuntos que eliges y las entradas de medios generados, las instrucciones del sistema (incluidos tus recuerdos, el Noura en uso y el texto completo de las habilidades que elegiste con / o que el modelo cargó) y las opciones de modelo van al proveedor de modelo que elegiste; cuando hace falta una búsqueda, los términos de búsqueda y las direcciones que pegaste van al proveedor de búsqueda.',
            'El Consejo de modelos, la investigación profunda y la revisión visual envían peticiones del mismo tipo a cada uno de los modelos que elegiste.',
            'Los adjuntos que algunos modelos no pueden leer los convierte antes en un paquete de texto el modelo de traducción que fijaste, y luego se entregan a los modelos que los necesitan.',
            'Puedes revisar el mensaje y los adjuntos antes de enviarlos; una vez enviados, quedan sujetos a las reglas del proveedor.'
          ]
        ]
      },
      {
        id: 'server',
        h: '7. Respuestas hechas por el servidor de Noureon',
        blocks: [
          'Para los usuarios que han iniciado sesión en una cuenta en la nube, las respuestas las hace por defecto el servidor de Noureon, de modo que una respuesta continúe cuando se cierra la página. En Ajustes → Privacidad puedes pasar a hacerlas solo en tu dispositivo.',
          [
            'Lo que se envía: el navegador envía al servidor el historial de la conversación, las instrucciones del sistema, el modelo elegido y la clave del proveedor (y la clave de búsqueda cuando se usa búsqueda) que necesita esa respuesta.',
            'Conservación de las claves: las claves se guardan cifradas, solo para esa respuesta, y se eliminan cuando termina; como máximo 2 h 15 min para una respuesta normal, 30 minutos para la generación de imágenes y 27 horas para la investigación profunda (que puede pausarse hasta un día). Nunca se guardan a largo plazo ni se escriben en registros o mensajes de error, y los mensajes de error que devuelven los proveedores se limpian antes de claves.',
            'La respuesta: el servidor escribe la respuesta en el mismo espacio de trabajo en la nube que la aplicación ya sincroniza.',
            'Las respuestas que deben terminarse en el navegador (entrada de voz, cámara), los usuarios sin sesión iniciada y los chats temporales se hacen siempre en tu dispositivo y no se envían al servidor.',
            'Registros de ejecución: el servidor guarda un registro de cada ejecución (sin claves), para que una ejecución pueda retomarse tras un reinicio del servidor y, una vez terminada, se conserva como registro de la petición de esa respuesta hasta que se retira; el prompt y las imágenes de referencia de una imagen se eliminan del registro cuando termina la imagen. Los registros del servidor tienen una línea por evento y no contienen el contenido de las peticiones, claves ni tokens; los campos cuyo nombre parece un secreto se ocultan.',
            'Límites: como máximo 5 respuestas a la vez por persona, 10 nuevas por minuto, peticiones de hasta 25 MB.'
          ]
        ]
      },
      {
        id: 'features',
        h: '8. Flujos de datos de cada función',
        blocks: [
          'Función por función, esto es lo que pasa por dónde.',
          [
            'Modo avanzado (Python): cuando lo ejecuta el servidor, el código que escribe el modelo y los archivos que adjuntaste van al servidor de entorno aislado de Noureon y se ejecutan en un contenedor aislado sin red y con recursos limitados, que se elimina al terminar la respuesta; los archivos creados se guardan en tu propio almacenamiento en la nube y se listan en la respuesta, hasta 500 MB por usuario, y los archivos a los que ya no remite ninguna conversación se eliminan automáticamente al cabo de un día aproximadamente. Cuando se ejecuta en el navegador, el código se ejecuta en una página aislada (run.noureon.com) con Pyodide, cargado desde jsDelivr.',
            'Investigación profunda: el plan, las notas, las páginas buscadas y leídas, el informe y el progreso se guardan en tu espacio en la nube; las páginas las lee el servidor en tu nombre; las búsquedas usan la clave del proveedor de búsqueda que fijaste. El archivo PDF, Word o Markdown se crea en el momento de exportar.',
            'Búsqueda web: cuando un modelo no puede buscar por sí mismo, el servidor redacta la consulta de búsqueda a partir de la conversación con el modelo que elegiste (con tu propia clave), la envía a tu proveedor de búsqueda y pone las páginas encontradas delante de la petición como «paquete de búsqueda»; la consulta, las páginas y la respuesta se escriben en tu espacio en la nube. Si el servidor se reinicia, la búsqueda puede repetirse.',
            'Generación de imágenes: cuando la hace el servidor, el prompt, las opciones (proporción, tamaño, ajustes avanzados), las imágenes de referencia que adjuntaste y la clave de OpenRouter van al servidor por HTTPS; el servidor pide la imagen al punto de imágenes de OpenRouter con tu clave y guarda la imagen en tu propio espacio en la nube. El prompt y las imágenes de referencia se guardan con el registro de la ejecución (sin la clave) hasta que termina la imagen. No se crean vistas previas. Si el servidor se reinicia a medias, la petición puede enviarse de nuevo y tu cuenta de OpenRouter puede cobrarse dos veces.',
            'Consejo de modelos: cuando lo celebra el servidor, el navegador envía el historial, tu mensaje y adjuntos, los miembros y el modelo de síntesis, lo que debe decirse en cada tipo de llamada (incluidas instrucciones del sistema, memoria y Nouras) y las claves de los proveedores usados (y las claves de búsqueda cuando busca). El servidor consulta cada modelo con tu clave; lo que respondieron los miembros ya terminados se guarda con la ejecución para que un reinicio no los vuelva a consultar, y se elimina cuando termina el consejo; la síntesis se rehace tras un reinicio, por lo que el proveedor del modelo de síntesis puede cobrar dos veces. Cada llamada a un modelo dura como máximo 30 minutos.',
            'Revisión visual: cuando la revisión automática está activada y una respuesta escribe una presentación, el servidor dibuja las diapositivas como imágenes, se las muestra al modelo que elegiste con tu propia clave y escribe en la conversación cualquier respuesta corregida; las imágenes no se guardan.',
            'El modelo de criterio: con una clave de OpenRouter, el texto de cada mensaje (con breves extractos de los dos mensajes anteriores, si hay un archivo adjunto y los nombres y descripciones de las herramientas de línea de comandos que dejas que el modelo use por sí mismo) se envía desde el navegador a la API Decisions de OpenRouter, donde un pequeño modelo de criterio decide si el mensaje necesita una búsqueda web, un archivo descargable, un gráfico o una herramienta de línea de comandos. Se usa tu propia clave de OpenRouter y Noureon no guarda nada; las conversaciones de imágenes no se envían. Sin clave, con una llamada fallida o que tarda más de un segundo, la aplicación decide con sus propias listas de palabras; tras dos fallos seguidos no se vuelve a intentar durante diez minutos. No hay un interruptor aparte, y elegir «solo en mi dispositivo» no lo desactiva, porque la llamada la hace el navegador.',
            'Habilidades: las habilidades que pegas se guardan en tu propia cuenta en la nube (solo tú puedes leerlas y cambiarlas; el servidor las lee con su rol de servicio); un paquete zip de habilidad se guarda en un depósito privado, en una carpeta que solo tú puedes leer y cambiar, y su lista de archivos en la fila de la habilidad. Cuando eliges una habilidad con /, o el modelo decide cargar una, el texto completo va con el mensaje al proveedor que elegiste (y pasa por el servidor cuando es el servidor quien hace la respuesta, que lee solo la usada). Cuando el modelo lee un archivo de texto de una habilidad (como máximo 20 000 caracteres y 10 archivos por respuesta), el contenido va al proveedor del mismo modo. Una habilidad que no se pidió ni se cargó no se envía. Cuando eliminas una habilidad, se elimina con su zip; un zip al que ya no apunta ninguna habilidad lo retira la limpieza diaria del servidor.',
            'Herramientas de línea de comandos: la lista de herramientas que añadiste se guarda en tus ajustes (y se sincroniza con ellos). Una herramienta solo se ejecuta en un contenedor aislado del servidor de entorno aislado; el comando que escribe el modelo y los archivos de la conversación se tratan como arriba; el programa de la herramienta lo descarga el anfitrión del entorno aislado desde su versión oficial (GitHub) y lo comprueba con un hash. La página Extensiones carga el icono de cada proyecto desde GitHub, por lo que GitHub ve esa petición.',
            'Conexiones a sitios: cuando una herramienta necesita Internet (descargar un vídeo, leer una red social, instalar su propio paquete de Python), solo puede llegar a él a través del proxy de filtrado del anfitrión del entorno aislado. El proxy decide según tus reglas en Ajustes → Permisos (permitir, preguntar o rechazar; pypi.org, files.pythonhosted.org, registry.npmjs.org, github.com y dos anfitriones de archivos de GitHub están permitidos al principio); de un sitio sin regla se pregunta en la conversación, y no responder en 10 minutos cuenta como rechazo. El proxy solo abre los puertos 80 y 443, resuelve él mismo el sitio y rechaza toda dirección interna del servidor (la propia máquina, redes privadas y de pods, direcciones de enlace local y de metadatos, y su propia dirección pública), digan lo que digan las reglas. Ve el nombre del sitio y el puerto, nunca la página ni lo que se envía, y registra el nombre del sitio y el puerto con la decisión (sin dirección de página ni contenido). Tus reglas se guardan en tus ajustes (y se sincronizan con ellos).',
            'Credenciales seguras: una credencial que añades para una herramienta (por ejemplo, la cookie de acceso de una cuenta) se guarda cifrada con AES-256-GCM en el servidor, bajo una clave maestra que solo existe en el entorno del servidor y vinculada a ti y al nombre de la credencial, en una tabla que solo el servidor puede leer. Solo se pone en el entorno de la herramienta (o en el archivo de acceso que la herramienta guardaría por sí misma, para un solo comando) mientras se ejecuta tu propia herramienta; lo que imprime el comando se limpia de la credencial antes de que lo vean el modelo o la página, y el modelo nunca recibe el valor. Puedes verla, sustituirla o eliminarla en Ajustes → Permisos; se elimina cuando la eliminas tú o eliminas la cuenta.',
            'Conectores: cuando conectas uno (por ahora Notion, Linear, Context7, Upstash, Vercel y GitHub), inicias sesión en la página del propio servicio (Noureon nunca ve tu contraseña); el servidor guarda el token de acceso y el de renovación cifrados con AES-256-GCM, bajo una clave maestra que solo existe en el entorno del servidor y vinculada a ti y al conector, en una tabla que solo el servidor puede leer, y nunca los entrega al navegador ni al modelo. El servidor también guarda la lista de herramientas del servicio y lo que permites para cada una (permitir, preguntar o rechazar). Los conectores solo se usan en respuestas hechas por el servidor, no en conversaciones temporales. Cuando el modelo usa una herramienta, el servidor llama al servicio con tu token y envía lo que el servicio devuelve (por ejemplo, el contenido de una página o de una incidencia) al proveedor de modelos que elegiste, como parte de la conversación; una herramienta en «preguntar» muestra antes sus parámetros exactos en una tarjeta. Una respuesta hace como máximo 30 llamadas a servicios, y un resultado se corta a los 30 000 caracteres. Al desconectar, el token se revoca en el servicio cuando este lo permite y se borra todo lo que se guarda aquí; GitHub no ofrece revocación: para cancelar la autorización allí, quita Noureon en Settings → Applications. La página Extensiones, la tarjeta de confirmación y los ajustes cargan el logotipo de cada conector desde GitHub, por lo que GitHub ve esa solicitud.',
            'Iconos y nombres de las fuentes citadas: junto a una fuente en una respuesta se muestran el pequeño icono y el nombre del sitio. El servidor de Noureon los obtiene (leyendo el marcado de la propia página del sitio, solo sitios públicos, con límite de tamaño y de tiempo y comprobando cada redirección), de modo que los sitios que miraste quedan entre tú y el servidor de Noureon y no se consulta a ningún servicio de iconos de terceros.',
            'Comentarios y propuestas de Noura: estos formularios son opcionales y envían solo los campos que rellenas, solo a través del proxy del mismo origen de este sitio (/api/google-form-submit, que exige una comprobación de Turnstile); si el operador no ha fijado un punto de recepción, el proxy no reenvía nada. Lo enviado va al formulario de Google que configuró el operador.'
          ]
        ]
      },
      {
        id: 'memory',
        h: '9. Memoria y recuerdo entre conversaciones',
        blocks: [
          [
            'Memoria automática: cuando está activada, el navegador usa tu clave de Gemini para convertir los últimos turnos de una conversación, los temas y los adjuntos que facilitaste en resúmenes y posibles preferencias personales (con un modelo ligero de Gemini); los resúmenes y los recuerdos confirmados se guardan en tu espacio de trabajo, y cuando has iniciado sesión y sincronizas, los recuerdos y los registros de resumen se sincronizan con la nube. Puedes ver, sustituir o eliminar cada uno en cualquier momento, y desactivar la memoria automática solo detiene los recuerdos nuevos.',
            'Recuerdo entre conversaciones: requiere tu consentimiento explícito. Una vez dado, cada pregunta se envía a Gemini Embedding 2 para obtener un vector y un índice local de este dispositivo encuentra hasta tres resúmenes pertinentes, que pasan a formar parte de la petición enviada al proveedor de modelo que elegiste. El estado del consentimiento sigue a la cuenta en todos los dispositivos, pero los vectores y el índice no se sincronizan: cada dispositivo construye los suyos. Sin consentimiento, no se buscan ni se envían conversaciones anteriores y no se llama a Embedding.',
            'Memoria de adjuntos: las imágenes, vídeos, audios y documentos pueden resumirse en puntos clave mediante la función de archivos de Gemini cuando se construye la memoria.',
            'Puedes activar o desactivar estas funciones en Ajustes, comprobar u optimizar el índice y exportar las preferencias personales confirmadas.'
          ]
        ]
      },
      {
        id: 'voice',
        h: '10. Entrada de voz, cámara y micrófono',
        blocks: [
          [
            'La entrada de voz la convierte en texto tu navegador, que puede pasar el audio a tu sistema operativo o a un servicio de voz en línea; Noureon no guarda una grabación aparte, y la onda se dibuja en directo en tu dispositivo. Antes del primer uso se muestra una explicación y se pide tu acuerdo.',
            'La cámara y el micrófono se usan solo después de que pulses el botón correspondiente y aceptes la solicitud de permiso del navegador; una foto que haces es el adjunto que añades y se trata según las reglas de los adjuntos.'
          ]
        ]
      },
      {
        id: 'p2p',
        h: '11. Transferencia directa entre dispositivos',
        blocks: [
          'La transferencia directa entre dispositivos usa PeerJS: su servidor público de emparejamiento (0.peerjs.com) solo sirve para que dos dispositivos se encuentren, con un código de 8 caracteres o un código QR. Una vez conectados, los elementos que elegiste (por ejemplo, conversaciones, Nouras, ajustes) van directamente entre los dos dispositivos y ni pasan por los servidores de Noureon ni se guardan en ellos. Empareja solo dispositivos de confianza y comprueba qué elementos vas a enviar.'
        ]
      },
      {
        id: 'logs',
        h: '12. Registros, seguridad y límites de frecuencia',
        blocks: [
          [
            'Los registros de nuestros servidores tienen una línea por evento y solo contienen campos elegidos uno a uno; no contienen el contenido de las peticiones, claves ni tokens, y los campos cuyo nombre parece un secreto se ocultan.',
            'Por seguridad y estabilidad el servidor tiene límites de frecuencia, que se cuentan por cuenta y se guardan solo en la memoria del servidor.',
            'Todo el tráfico hacia los servidores de Noureon usa HTTPS; las claves y credenciales en el servidor se guardan cifradas.',
            'El sitio web tiene una política de seguridad de contenido (CSP) que limita desde dónde puede cargar la página y a dónde puede conectarse.',
            'El entorno aislado tiene límites de memoria y de CPU, y el contenedor se elimina al terminar la respuesta.'
          ]
        ]
      },
      {
        id: 'analytics',
        h: '13. Análisis, publicidad y seguimiento',
        blocks: [
          'Noureon no tiene análisis integrado, seguimiento publicitario ni scripts de seguimiento entre sitios, y no vende datos personales. La página de inicio antes de iniciar sesión y las páginas públicas (Términos de uso, Política de privacidad, historial de actualizaciones) tampoco tienen scripts de análisis. Los proveedores que alojan el sitio web y los servidores tratan datos de conexión (por ejemplo, direcciones IP y registros de peticiones) para entregar las páginas y mantener el servicio. Quien aloje Noureon por su cuenta y añada análisis debe describirlo aparte.'
        ]
      },
      {
        id: 'retention',
        h: '14. Cuánto tiempo se conservan los datos y eliminación',
        blocks: [
          [
            'Datos en el navegador: hasta que los elimines o borres los datos del navegador.',
            'El espacio de trabajo en la nube: hasta que lo elimines o elimines la cuenta; cuando has iniciado sesión y sincronizas, las eliminaciones y restauraciones se sincronizan con la nube (con marcas de eliminación). Los elementos de la papelera se pueden restaurar o eliminar para siempre.',
            'Claves guardadas temporalmente en el servidor: como máximo 2 h 15 min para una respuesta normal, 30 minutos para una imagen, 27 horas para una investigación profunda; normalmente se eliminan al terminar la respuesta.',
            'Contenedores del entorno aislado y lo que hay en memoria: se eliminan al terminar la respuesta.',
            'Archivos en la nube: los archivos a los que no remite ninguna conversación se eliminan automáticamente al cabo de un día aproximadamente; el zip de una habilidad se elimina con la habilidad, y un zip al que no apunta ninguna habilidad lo retira la limpieza diaria.',
            'Credenciales seguras: hasta que las elimines o elimines la cuenta.',
            'Accesos de los conectores: hasta que desconectes (el token se revoca entonces en el servicio cuando este lo permite, y se borra aquí) o elimines la cuenta.',
            'Registros del servidor: solo registros de eventos sin contenido, conservados según lo exija la operación. Los registros de ejecución (sin claves) se conservan hasta que se retiran; el prompt y las imágenes de referencia de una imagen se eliminan cuando termina la imagen.',
            'Correos enviados al soporte: se conservan para atender tu consulta y, cuando haga falta, se eliminan a petición tuya.'
          ]
        ]
      },
      {
        id: 'rights',
        h: '15. Tus opciones y derechos',
        blocks: [
          [
            'No inicies sesión en una cuenta en la nube y ningún dato del espacio de trabajo saldrá de tu dispositivo (aparte de las peticiones que envías a los proveedores).',
            'En Ajustes → Privacidad elige hacer las respuestas solo en tu dispositivo, y el historial y las claves no se enviarán a nuestros servidores.',
            'Desactiva la memoria automática y el recuerdo entre conversaciones para detener esos flujos de datos.',
            'Exporta, importa, elimina, restaura o elimina para siempre tus datos en cualquier momento; usa «Borrar todos los registros y datos» para vaciar este navegador.',
            'Consulta, sustituye o elimina tus credenciales seguras, conectores, habilidades y reglas de sitios.',
            'Para obtener, corregir o eliminar los datos de tu cuenta en la nube, escribe a support@noureon.com desde el correo con el que te registraste; responderemos en un plazo razonable. Según la ley del lugar donde vivas, también puedes tener derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición; escríbenos para ejercerlos.'
          ]
        ]
      },
      {
        id: 'children',
        h: '16. Menores y transferencias internacionales',
        blocks: [
          [
            'Noureon no es un servicio diseñado para menores. Los proveedores que uses también tienen normas de edad; cúmplelas.',
            'Los proveedores que elijas y la infraestructura que usamos pueden estar en distintos países, por lo que los datos pueden tratarse fuera del lugar donde vives.'
          ]
        ]
      },
      {
        id: 'thirdparties',
        h: '17. Los servicios de terceros de un vistazo',
        blocks: [
          [
            'Supabase: verificación de cuentas, base de datos y almacenamiento de archivos (para la sincronización en la nube y la ejecución en el servidor).',
            'Cloudflare: la comprobación anti-bots Turnstile.',
            'Google Gemini, OpenRouter, NVIDIA, Tavily, TinyFish: los proveedores de modelos y de búsqueda que configuras.',
            'GitHub: descargas e iconos de las herramientas de línea de comandos, y el código fuente.',
            'Notion, Linear, Context7, Upstash, Vercel, GitHub: los servicios que conectas como conectores, cuando los conectas (cada uno tiene sus propias condiciones y política de privacidad).',
            'Vercel: alojamiento y entrega del sitio web.',
            'jsDelivr: carga de Python en el navegador (Pyodide).',
            'PeerJS: el servidor de emparejamiento de la transferencia directa entre dispositivos.',
            'Google Forms: comentarios y propuestas de Noura (cuando el operador lo configura).',
            'Un servicio de envío de correo: correos de verificación y recuperación de cuentas.',
            'Tu navegador y tu sistema operativo: reconocimiento de voz.'
          ],
          'Cada uno de estos servicios tiene su propia política de privacidad.'
        ]
      },
      {
        id: 'selfhost',
        h: '18. Alojarlo por tu cuenta',
        blocks: [
          'Si alojas Noureon por tu cuenta, no subas nunca al repositorio claves reales de proveedores, credenciales SMTP, claves de Resend, claves de servicio de Supabase, URL de Google Apps Script ni otros secretos; usa variables de entorno para los ajustes del servidor y guarda las claves de los proveedores en los ajustes locales, salvo que tengas un plan aparte de gestión de secretos cifrados. Si el despliegue añade análisis, su propietario debe describirlo aparte.'
        ]
      },
      {
        id: 'changes',
        h: '19. Cambios en esta política',
        blocks: [
          'Podemos modificar esta política según evolucionen las funciones. La nueva versión se publica en esta página con la fecha de arriba actualizada, y los cambios importantes también se escriben en el historial de actualizaciones (noureon.com/updates). PRIVACY.md en GitHub se actualiza a la vez.'
        ]
      },
      {
        id: 'contact',
        h: '20. Contacto',
        blocks: [
          'Para dudas de privacidad, cuenta, sincronización, correo o datos: support@noureon.com. Por favor, no adjuntes claves de API, contraseñas de sincronización ni datos de recuperación.'
        ]
      }
    ]
  }
};
