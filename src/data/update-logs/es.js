// The update notes in Spanish (see translations.js): `{ "<version>": [the strings of the note in src/data/update-logs/entries.js, translated] }`.
// Every version that has notes is here, with the same number of strings and the same HTML tags in the same order as the original (tests/update-logs-translations.test.js).
export default {
  "18.3.1": [
    "<strong>Notas de la versión de Noureon 18.3.1</strong>",
    "Esta versión rediseña la pantalla de espera de la generación de imágenes, con una animación de puntos más fina.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Animación de puntos:</strong> los puntos se dibujan ahora directamente sobre la página, sin fondo de tarjeta ni borde. Son más pequeños y espaciados, y su tamaño e intensidad siguen nubes suaves que se desplazan lentamente sobre la cuadrícula, dejando algunas zonas casi vacías. La cuadrícula cubre el área que ocupará la imagen terminada, y el color sigue siendo el color de énfasis seleccionado.</li><li><strong>Textos de etapa:</strong> el texto pasa a la parte superior de los puntos y se desvanece con ellos cuando la imagen está lista.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "18.3.0": [
    "<strong>Notas de la versión de Noureon 18.3.0</strong>",
    "Esta versión mejora la pantalla de espera mientras se genera una imagen: una animación de puntos con textos de etapa.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Animación de puntos:</strong> el bloque de espera muestra un patrón de nube en movimiento formado por puntos. Los puntos usan el color de énfasis seleccionado y se ven con claridad tanto en modo claro como en modo oscuro. Si el sistema está configurado para reducir el movimiento, se muestra un único patrón estático.</li><li><strong>Textos de etapa:</strong> el texto de la esquina superior izquierda del bloque cambia según el tiempo de espera: «Creando la imagen», «Componiendo la imagen», «Afinando los detalles» y, pasados unos 40 segundos, «Sigue en proceso. Las imágenes de alta calidad tardan más». Los textos siguen el tiempo y no indican el progreso real, por lo que no se muestra ningún porcentaje.</li><li><strong>Al reabrir la página:</strong> si la página se cierra y se vuelve a abrir mientras una imagen aún se genera en el servidor, la espera se cuenta desde la hora real de inicio, de modo que los textos no empiezan de nuevo.</li><li><strong>Transición al terminar:</strong> cuando la imagen está lista, los puntos se desvanecen y dan paso a la imagen.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "18.2.0": [
    "<strong>Notas de la versión de Noureon 18.2.0</strong>",
    "El Centro de ayuda, los Términos de uso y la Política de privacidad se han reescrito por completo, con secciones e índice, y cubren todas las funciones y flujos de datos actuales.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Centro de ayuda:</strong>una página nueva, noureon.com/help, con 18 secciones, desde los primeros pasos hasta la solución de problemas; el «Centro de ayuda» de Ajustes y el pie de la página de inicio enlazan a ella.</li><li><strong>Términos de uso:</strong>16 secciones sobre qué es el servicio, la responsabilidad sobre cuentas y datos, los límites de las respuestas de la IA, proveedores y costes, la ejecución en el servidor y sus límites, habilidades y herramientas de línea de comandos, conductas prohibidas, exención de garantías y limitación de responsabilidad, y más.</li><li><strong>Política de privacidad:</strong>20 secciones que explican qué se guarda en el navegador y en la nube, qué se envía a los proveedores, la ejecución en el servidor y cuánto se guardan las claves, el flujo de datos de cada función, la memoria, la voz, la transferencia directa entre dispositivos, los servicios de terceros y los plazos de conservación.</li><li><strong>Además:</strong>los tres documentos están en cinco idiomas; PRIVACY.md en GitHub se genera ahora a partir de la versión en inglés.</li></ul>"
  ],
  "18.1.0": [
    "<strong>Notas de la versión de Noureon 18.1.0</strong>",
    "La página que se muestra antes de iniciar sesión se ha rehecho: desplázate para ver, en pantallas reales, cómo funcionan el Consejo de modelos, la investigación profunda y los archivos, y después las extensiones, las cifras, la ejecución en el servidor, la privacidad y el inicio de sesión.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Nueva página de inicio:</strong>tres presentaciones con desplazamiento hechas con capturas de los propios componentes de Noureon, un juego para el tema claro y el oscuro en cada uno de los cinco idiomas; el pie de página incluye las novedades, GitHub, la cuenta oficial de X @NoureonAi, las condiciones de uso y la política de privacidad.</li><li><strong>Texto de vista previa del enlace:</strong>se reescriben el título y la descripción que se muestran al compartir noureon.com.</li><li><strong>Limpieza:</strong>se eliminaron las conversaciones de ejemplo y el código de la antigua página de inicio, que ya no se usaban.</li></ul>"
  ],
  "18.0.0": [
    "<strong>Notas de la versión de Noureon 18.0.0</strong>",
    "Esta versión añade las habilidades: una vez añadida una habilidad en la página Extensiones, el modelo sigue sus instrucciones. Hay 11 habilidades oficiales; también puedes pegar la tuya o subir un zip, y pedir al modelo que te ayude a crear una. Es la primera versión principal desde que la tienda de herramientas de línea de comandos pasó a ser la página Extensiones.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Página Extensiones:</strong>la tienda de herramientas de línea de comandos se llama ahora Extensiones y tiene dos partes, Habilidades y Herramientas de línea de comandos; sus direcciones se acortan a /skill y /cli.</li><li><strong>Habilidades:</strong>una habilidad es un archivo SKILL.md (nombre, descripción, texto). Las habilidades que pegas se guardan en tu propia cuenta en la nube, que solo tú puedes leer y cambiar, hasta 50; las listas de habilidades añadidas se combinan entre dispositivos elemento por elemento.</li><li><strong>Usar una habilidad:</strong>escribe / en el cuadro de mensaje y elige una habilidad, y esa respuesta la sigue; el modelo también puede decidir por sí mismo: ve el nombre y una línea de cada habilidad que permites, y carga el texto completo solo cuando lo necesita (puedes desactivar «permitir que el modelo la use por sí mismo» en cada habilidad, y se cargan 5 como máximo en una respuesta). Las respuestas normales, con búsqueda y en modo avanzado se admiten, en este dispositivo y en el servidor.</li><li><strong>Habilidades con archivos:</strong>puedes subir un zip (SKILL.md con referencias, scripts y recursos; hasta 5 MB y 60 archivos), que se comprueba en el navegador y de nuevo en el servidor, y rechaza programas, instaladores, enlaces y rutas inseguras. El modelo puede leer los archivos de texto de una habilidad; los scripts de Python y shell solo se ejecutan en el entorno aislado del servidor, con la carpeta de la habilidad montada en solo lectura en /skills. Las habilidades con scripts no se ofrecen en un chat temporal.</li><li><strong>Crear habilidades:</strong>la habilidad oficial «Crear una habilidad» averigua para qué sirve, redacta un borrador, lo prueba y lo mejora, y luego pone una tarjeta de borrador en el chat; su botón abre una ventana donde lo lees todo (cada archivo de un borrador con archivos se puede leer) y pulsas Añadir para guardarla. El modelo no puede guardar una habilidad por sí mismo.</li><li><strong>11 habilidades oficiales:</strong>Crear una habilidad, Acta de reunión, Corrección, Verificación de datos, Guion de presentación, Redacción de correos, Informe de investigación, Comparación de fuentes, Explicador de conceptos, Preguntas sobre un documento y Resumen. Ninguna se añade por defecto: pulsa + en la página Extensiones; cada una tiene su nombre y descripción en cinco idiomas, y responde en el idioma que usas.</li><li><strong>Privacidad:</strong>el texto completo de una habilidad se envía con el mensaje que la usa al proveedor de IA que elegiste (y a través del servidor cuando es el servidor quien hace la respuesta); una habilidad que no se usa no se envía. Ajustes → Privacidad y PRIVACY.md lo explican.</li><li><strong>Limpieza:</strong>un zip al que ya no apunta ninguna habilidad (una cuenta eliminada, un guardado que no terminó) lo trata la limpieza diaria del servidor, que solo informa mientras no se cambie a eliminar; no se borra nada antes.</li><li><strong>Otros cambios:</strong>el control de profundidad de razonamiento es una pista dentro de un marco con un botón rodeado del color de acento; en iPhone, con el teclado abierto, la aplicación termina donde termina el área visible, un dedo ya no arrastra toda la página y la lista @ se ajusta al área visible; un tema de color que llega de otro dispositivo se muestra al instante.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización añade la tabla user_skills, el bucket user-skill-bundles y una función de limpieza (ya aplicados al proyecto en producción). Para que el modelo cargue habilidades, lea sus archivos y ejecute scripts en el servidor, el servidor y el host del entorno aislado deben actualizarse a esta versión."
  ],
  "17.17.0": [
    "<strong>Notas de la versión de Noureon 17.17.0</strong>",
    "Esta versión da a cada color de acento sus propios colores de burbuja de mensaje y añade el blanco a los colores de acento del tema oscuro.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Colores de burbuja:</strong> en el tema claro la burbuja es un tono pálido del color con letras oscuras; en el tema oscuro, un tono profundo con letras claras; cada uno de los diez colores de acento tiene su propio par, en lugar de limitarse a aclarar el acento.</li><li><strong>Colores personalizados:</strong> para un color que eliges tú, la burbuja se calcula entre los dos colores predefinidos vecinos con las mismas proporciones (luz, profundidad, tono); un color gris da una burbuja gris.</li><li><strong>Negro y blanco:</strong> los colores de acento del tema claro incluyen el negro; en el tema oscuro, esa misma opción pasa a ser el blanco (el nombre y el punto también cambian, incluso con el menú abierto).</li><li><strong>Seguir el sistema:</strong> con la apariencia en «seguir el sistema», cuando el dispositivo cambia entre claro y oscuro, el acento y los colores de la burbuja cambian al instante, sin recargar.</li><li><strong>Control de profundidad de razonamiento:</strong> el control ahora es una pista dentro de un marco: la parte rellena tiene el color de acento y el botón es un disco oscuro (claro en el tema oscuro) rodeado por un anillo de acento por todos lados, dentro del marco; el botón de profundidad de razonamiento del cuadro de entrada conserva el ancho de su nombre más largo, y su nombre sigue al botón mientras se arrastra, así que el panel de encima ya no salta de lado al cambiar de nivel.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.16.0": [
    "<strong>Notas de la versión de Noureon 17.16.0</strong>",
    "Esta versión añade un modelo de juicio: al enviar un mensaje, el pequeño modelo Decisions de OpenRouter juzga si necesita una búsqueda web, un archivo, un gráfico o una herramienta de comandos, en lugar de adivinar solo por palabras clave.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Cuatro preguntas a la vez:</strong> con una clave de OpenRouter, cada mensaje hace una sola llamada que plantea cuatro preguntas al modelo de juicio (¿necesita datos actuales, un archivo, un gráfico, una herramienta de comandos?); una probabilidad del 60 % o más cuenta como sí.</li><li><strong>Herramientas de comandos, con cuidado:</strong> solo se decide sobre las herramientas que dejas que el modelo use por sí solo (si se le ofrecen en este turno); las que eliges con @ se dan siempre.</li><li><strong>Si falla, el método de antes:</strong> sin clave de OpenRouter, con una llamada fallida o más lenta de 1 segundo, deciden las listas de palabras clave como antes y no se muestra nada; tras dos fallos seguidos espera 10 minutos antes de volver a intentarlo. Las conversaciones de imágenes no envían nada.</li><li><strong>Privacidad:</strong> el texto del mensaje (con breves extractos de los dos mensajes anteriores, si hay un archivo adjunto y los nombres de las herramientas de comandos que dejas que el modelo use por sí solo) se envía a OpenRouter y Noureon no guarda nada; Ajustes → Privacidad y PRIVACY.md lo explican.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.15.4": [
    "<strong>Notas de la versión de Noureon 17.15.4</strong>",
    "Esta versión elimina el desvanecido de la lista de la barra lateral bajo la fila de búsqueda y hace que el desvanecido sobre la fila de la cuenta ya no deje una línea de corte.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Bajo la fila de búsqueda:</strong> se elimina el desvanecido; la lista simplemente se desplaza bajo la fila de búsqueda, y el espacio entre la fila de búsqueda y la lista vuelve a ser el de antes.</li><li><strong>Sobre la fila de la cuenta:</strong> la parte del desvanecido más cercana al borde es ahora totalmente opaca, de modo que el texto pegado a la fila de la cuenta queda totalmente cubierto y luego aparece de forma gradual, en lugar de dejar una línea de corte de medias letras pálidas; en reposo no cubre texto de la última fila.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.15.3": [
    "<strong>Notas de la versión de Noureon 17.15.3</strong>",
    "Esta versión corrige la posición del desvanecido de la barra lateral de la 17.15.2: el desvanecido se quedaba a cierta distancia del borde, así que una parte de la lista bajo la fila de búsqueda seguía sin cubrir.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Desvanecido de la barra lateral:</strong> la posición de las franjas fijas en los bordes de la lista se mide desde dentro del relleno de la lista, por lo que en la 17.15.2 se fijaban 16 píxeles por debajo del borde, y el texto bajo la fila de búsqueda no se desvanecía nada en esa distancia y parecía cortado. Ahora las franjas están justo en los bordes superior e inferior de la lista; una medición por píxeles confirma que el texto en el borde queda totalmente cubierto y aparece de forma gradual.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.15.2": [
    "<strong>Notas de la versión de Noureon 17.15.2</strong>",
    "Esta versión vuelve a corregir la costura donde la lista de la barra lateral se cortaba bajo la fila de búsqueda.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Desvanecido de la barra lateral:</strong> el desvanecido era una franja puesta sobre la lista desde fuera, y en un iPhone la lista que se desplaza se dibujaba encima, así que la lista quedaba cortada en seco bajo la fila de búsqueda. Ahora el desvanecido es una franja dentro de la lista, fija en sus bordes superior e inferior (como en la conversación), y también cubre el texto en un iPhone.</li><li><strong>Fondo de la barra lateral:</strong> la barra lateral es opaca, del color que mostraba cuando era translúcida; en el teléfono ya no se ven a través de ella la conversación y el cuadro de mensaje, y los desvanecidos de sus bordes coinciden exactamente con su color.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.15.1": [
    "<strong>Notas de la versión de Noureon 17.15.1</strong>",
    "Esta versión corrige el aspecto del campo del código de uso compartido P2P en el teléfono, el desvanecido en la parte superior e inferior de la barra lateral, y aumenta el contraste del texto de sugerencia del tema oscuro.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Campo del código P2P:</strong> en un iPhone, el campo donde se escribe el código de 5 caracteres, al recibir carpetas y al recibir Nouras, se dibujaba con la sombra interior y el marco de enfoque del sistema y parecía roto; ahora tiene el mismo estilo que los demás campos.</li><li><strong>Desvanecido de la barra lateral:</strong> el desvanecido de la lista bajo la fila de búsqueda y sobre la fila de la cuenta es un degradado más largo y progresivo, de modo que la primera línea de texto ya no se corta por la mitad; el panel derecho se ajusta igual.</li><li><strong>Texto de sugerencia del tema oscuro:</strong> el texto secundario y el de sugerencia del tema oscuro (la sugerencia del campo de entrada, las horas, etc.) es más claro, y su contraste sobre el color de un diálogo sube de 2,9 a 4,3.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.15.0": [
    "<strong>Notas de la versión de Noureon 17.15.0</strong>",
    "Esta versión cambia el nombre de «Color del botón principal» a «Color de acento» en los ajustes, sustituye sus opciones por diez colores nuevos y hace que el fondo de la burbuja de los mensajes del usuario siga al acento.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Color de acento:</strong> «Color del botón principal» en Ajustes → Personalización → Apariencia pasa a llamarse «Color de acento», con Azul (predeterminado), Cian, Verde, Lima, Amarillo, Naranja, Rosa, Magenta, Morado, Negro y un código de color personalizado. Toda la interfaz tiene este único acento: el botón de envío, los interruptores, los marcos seleccionados y el fondo de las burbujas lo siguen.</li><li><strong>Burbuja de mensaje:</strong> se elimina el ajuste «Color de burbuja de mensaje de usuario»; el fondo de la burbuja es un tono pálido del acento, con una intensidad adecuada para el tema claro y el oscuro.</li><li><strong>Tema oscuro:</strong> un acento difícil de ver en el tema oscuro se aclara automáticamente; el negro se muestra como gris claro en el tema oscuro, como el botón principal en blanco y negro.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>El color elegido antes para el fondo de la burbuja ya no se aplica; un acento elegido antes entre verde, amarillo, rosa, naranja o morado se muestra como «Personalizado» con el mismo código de color.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos; el campo userBubbleColor de los ajustes se descarta al leerlos."
  ],
  "17.14.1": [
    "<strong>Notas de la versión de Noureon 17.14.1</strong>",
    "Esta versión corrige tres problemas de visualización notificados tras el modo oscuro de la 17.14.0 y cambia el nombre del ajuste a «Apariencia».",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Ajustes en el teléfono:</strong> en modo oscuro, toda la página de ajustes era translúcida y dejaba ver la barra lateral detrás; ahora tiene un fondo opaco.</li><li><strong>Desvanecido de la barra lateral:</strong> el desvanecido en la parte superior e inferior de la barra lateral no coincidía con su color, por lo que aparecía una banda más clara en modo oscuro y el texto de la lista se veía por la rendija; ahora el desvanecido usa el mismo color que la barra lateral.</li><li><strong>Vista previa de archivos:</strong> el fondo bajo las páginas de una vista previa, como las presentaciones, es más oscuro en modo oscuro, los números de página siguen el color del texto y vuelven a leerse, y el borde de una diapositiva tiene una línea fina en modo oscuro.</li><li><strong>Nombre del ajuste:</strong> «Modo de color» en Ajustes → Personalización → Apariencia pasa a llamarse «Apariencia».</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.14.0": [
    "<strong>Notas de la versión de Noureon 17.14.0</strong>",
    "Esta versión añade un modo oscuro y reúne los colores de la interfaz bajo un único conjunto de nombres fijos.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Apariencia:</strong> Ajustes → Personalización → Apariencia incluye una nueva opción «Apariencia»: claro, oscuro o seguir el sistema. El predeterminado es el claro; la elección se aplica al instante y se sincroniza con los ajustes de la nube. El tema oscuro es un gris oscuro.</li><li><strong>Todas las pantallas:</strong> la pantalla principal, la barra lateral, las conversaciones, todas las pestañas de ajustes, los diálogos, la tienda de herramientas de línea de comandos, la tienda de Nouras, la búsqueda, la investigación profunda, el panel de datos personales con sus gráficos y los paneles de citas y fuentes tienen versión oscura; las vistas previas de archivos (Word, PDF, presentaciones, hojas de cálculo) y las imágenes generadas conservan un fondo blanco, como el papel.</li><li><strong>Un solo conjunto de colores:</strong> el texto tiene tres niveles y los fondos tres capas, con líneas, acento, colores de estado y sombras comunes; el texto pálido del tema claro (sugerencias, hora de los mensajes) es más oscuro y su contraste sobre blanco sube de 2,5 a unos 3,5.</li><li><strong>Pantalla de inicio:</strong> con el tema oscuro, la página ya no parpadea en blanco al abrirse; la barra del navegador, la barra de estado de una aplicación instalada y su pantalla de lanzamiento también son oscuras. La aplicación de la pantalla de inicio en iPhone y iPad tiene una imagen de inicio clara y otra oscura, según la apariencia del dispositivo.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>La imagen de inicio en iPhone y iPad sigue la apariencia del dispositivo, no la apariencia ajustada en la aplicación; la pantalla de un modelo nuevo que aún no figura en la lista arranca en blanco.</li><li>Tras cambiar el ajuste de apariencia, una aplicación instalada solo cambia su pantalla de lanzamiento cuando el navegador comprueba la siguiente actualización.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos; los ajustes ganan un campo colorScheme que las versiones anteriores ignoran."
  ],
  "17.13.0": [
    "<strong>Notas de la versión de Noureon 17.13.0</strong>",
    "Esta versión convierte las Condiciones de uso, la Política de privacidad y las notas de actualización en páginas web públicas independientes, que se pueden leer y compartir sin iniciar sesión.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Páginas públicas:</strong> las Condiciones de uso (noureon.com/terms), la Política de privacidad (noureon.com/privacy) y las notas de actualización completas (noureon.com/updates) tienen cada una su propia dirección. No requieren iniciar sesión y no cargan la aplicación. Las páginas están disponibles en 繁體中文, English, Français, Русский y Español; el idioma sigue la configuración del navegador y se puede cambiar en la parte superior derecha de la página. Los modos claro y oscuro siguen el sistema.</li><li><strong>Página de notas de actualización:</strong> las versiones se agrupan por mes y cada versión tiene un enlace que se puede compartir (por ejemplo, noureon.com/updates#v17.13.0). La página incluye un índice que se pliega en tres niveles (año, mes, versión) y mantiene abierto solo el mes que se está leyendo, de modo que sigue siendo corto sin importar cuántas versiones se añadan: en el ordenador está a la derecha y marca la versión que se está leyendo al desplazarse; en teléfonos y ventanas estrechas el «Índice» está bajo el título y, tras desplazarse, permanece en una barra en la parte superior de la ventana desde la que se puede abrir. Una vez desplazada la página, un botón en la esquina inferior derecha vuelve al principio. Los niveles y el panel del índice se abren y se cierran con una breve animación.</li><li><strong>Notas de actualización en cinco idiomas:</strong> las notas de cada versión están disponibles en 繁體中文, English, Français, Русский y Español. La página de notas muestra el idioma seleccionado y la ventana de nueva versión muestra el idioma de la aplicación.</li><li><strong>Puntos de acceso:</strong> «Condiciones y políticas» e «Información de la versión» en los ajustes pasan a ser enlaces que se abren en una pestaña nueva; se añaden enlaces a las Condiciones de uso y a la Política de privacidad al pie de la página de inicio de sesión; «Ver el historial completo de actualizaciones» en la ventana de nueva versión lleva a la página de notas de actualización. Se han eliminado la antigua ventana de historial de actualizaciones en los ajustes y las secciones desplegables de las condiciones.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Las tres páginas son páginas web independientes, ajenas a la aplicación, y no se guardan en caché para uso sin conexión; no se pueden abrir sin conexión.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.12.1": [
    "<strong>Notas de la versión de Noureon 17.12.1</strong>",
    "Esta versión sustituye Claude 4.5 Haiku en OpenRouter por el recién publicado Claude Haiku 5.5.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Claude Haiku 5.5:</strong> sustituye a Claude 4.5 Haiku y aparece en el menú de modelos, bajo Anthropic. Precio: 0,10 USD por millón de tokens de entrada y 0,50 USD por millón de tokens de salida (cuando el prompt supera los 100 000 tokens, 0,50 USD de entrada y 2,50 USD de salida). Longitud de contexto de 1 millón de tokens y hasta 128 000 tokens de salida por solicitud. Admite imágenes y archivos como entrada, con salida de texto; puede usarse para llamadas a herramientas en el modo Avanzado (Python).</li><li><strong>Razonamiento:</strong> cinco niveles (Bajo, Medio, Alto, Muy alto y Máximo), con Medio como valor predeterminado (el mismo que el de la API de Anthropic).</li><li><strong>Conversaciones existentes:</strong> las conversaciones que usaban Claude 4.5 Haiku, los grupos del consejo de modelos y los modelos usados recientemente pasan automáticamente a Claude Haiku 5.5.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Claude Haiku 5.5 usa un tokenizador más reciente: el mismo texto equivale a aproximadamente un 30 % más de tokens que con Claude 4.5 Haiku, por lo que el coste real no baja en la misma proporción.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos; las conversaciones, la memoria y los datos sincronizados existentes no se ven afectados."
  ],
  "17.12.0": [
    "<strong>Notas de la versión de Noureon 17.12.0</strong>",
    "Esta versión añade la posibilidad de que un modelo salga del consejo de varios modelos mientras este está en marcha, lo que permite detener modelos que responden con demasiada lentitud o que no resultan adecuados.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Un modelo puede salir del consejo:</strong> mientras el consejo está en marcha, junto a cada modelo que sigue respondiendo aparece un botón «Salir». Al pulsarlo se muestra primero una ventana de confirmación; tras confirmar, ese modelo se detiene de inmediato, su respuesta ya generada no se incluye en el resultado del consejo y los demás modelos continúan hasta completarlo. Es válido tanto para consejos ejecutados en el dispositivo como en el servidor.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>El consejo debe conservar al menos 2 modelos, por lo que el botón «Salir» no se muestra cuando solo quedan 2 modelos.</li><li>El modelo encargado de elaborar la respuesta final no puede salir; para interrumpir el consejo, pulse «Detener».</li><li>El proveedor puede seguir cobrando el contenido generado antes de que el modelo salga.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.11.0": [
    "<strong>Notas de la versión de Noureon 17.11.0</strong>",
    "Esta versión traslada el consejo de varios modelos al servidor: tras el envío, el consejo se completa aunque se cierre la página o se bloquee el teléfono, y al volver a abrirla la respuesta ya está escrita en la conversación.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>El consejo de varios modelos se ejecuta en el servidor:</strong> con la sesión iniciada en una cuenta en la nube, el consejo se ejecuta por defecto en el servidor de Noureon. Todo el proceso (respuestas de los miembros, debate, búsqueda y síntesis de la respuesta) se realiza en el servidor; al reabrir la página (o abrir la misma conversación en otro dispositivo) se vuelve al mismo panel de progreso y se sigue mostrando la generación de la respuesta de síntesis. Se puede pulsar «Detener» en cualquier momento, y el texto de síntesis ya generado se conserva.</li><li><strong>Continuación tras un reinicio del servidor:</strong> las respuestas de los miembros y las búsquedas ya completadas se guardan temporalmente; tras un reinicio solo se repite la síntesis, sin volver a consultar a cada modelo.</li><li><strong>Un modelo que supera el tiempo de espera no afecta al consejo:</strong> cada llamada a un modelo espera como máximo 30 minutos; si se supera, ese miembro se considera fallido y los demás completan el consejo con normalidad.</li><li><strong>La página de Configuración ya no parpadea en blanco al abrirse:</strong> se corrige el problema por el que la pantalla se ponía brevemente en blanco la primera vez que se abría Configuración en el teléfono.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Se requiere una cuenta en la nube. Si se elige «Este dispositivo», no se ha iniciado sesión, se trata de un chat temporal, faltan claves o la solicitud es demasiado grande (más de 25 MB), el consejo se sigue ejecutando en el navegador; si no es posible conectar con el servidor, también pasa automáticamente a ejecutarse en este dispositivo.</li><li>Las claves de API de cada proveedor (y la clave de búsqueda) que usa el consejo se guardan cifradas de forma temporal y se eliminan al terminar el consejo, con un máximo de conservación de 2 horas y 15 minutos; el historial de la conversación, los mensajes, los archivos adjuntos y las respuestas de cada modelo pasan por el servidor (consulte la página de privacidad y la política de privacidad).</li><li>Si el servidor se reinicia durante la síntesis, esta se repite una vez, por lo que ese proveedor podría cobrarla dos veces.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.10.0": [
    "<strong>Notas de la versión de Noureon 17.10.0</strong>",
    "Esta versión traslada al servidor la búsqueda web de los modelos que no tienen capacidad de búsqueda propia: tras el envío, la búsqueda y la respuesta se completan aunque se cierre la página o se bloquee el teléfono.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>La búsqueda se realiza en el servidor:</strong> cuando la búsqueda web está activada y el modelo no puede buscar ni llamar a herramientas (por ejemplo, algunos modelos de NVIDIA y OpenRouter), el servidor redacta los términos de búsqueda a partir de la conversación, busca en la web y entrega al modelo las páginas obtenidas para que responda. La respuesta sigue mostrando «N sitios consultados» y las etiquetas de fuente [n]; durante la búsqueda se muestra «Buscando con Tavily» (o TinyFish).</li><li><strong>Profundidad de búsqueda y alternativa:</strong> la profundidad de búsqueda de Tavily elegida en Configuración (básica o avanzada) ahora también se aplica en el servidor (antes, la búsqueda en el servidor era siempre básica); si el servicio de búsqueda elegido no devuelve resultados o da error, se usa el otro servicio (se requiere que ambas claves estén configuradas), con el mismo comportamiento que en el navegador.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Se requiere una cuenta en la nube. Si se elige «Este dispositivo», no se ha iniciado sesión, se trata de un chat temporal o la solicitud es demasiado grande, la búsqueda y la respuesta se siguen realizando en el navegador. Si no es posible conectar con el servidor, también pasan automáticamente a realizarse en este dispositivo.</li><li>Las claves de búsqueda (Tavily, TinyFish) se guardan cifradas de forma temporal igual que las claves de API y se eliminan al terminar la respuesta; los términos de búsqueda y las páginas obtenidas pasan por el servidor (consulte la página de privacidad y la política de privacidad).</li><li>Si el servidor se reinicia durante la búsqueda, esta podría repetirse una vez.</li><li>En esta versión, la búsqueda del consejo de varios modelos se sigue realizando en el navegador.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.9.2": [
    "<strong>Notas de la versión de Noureon 17.9.2</strong>",
    "Esta versión añade un aviso cuando falla una respuesta del servidor, reduce el parpadeo al abrir Configuración en el teléfono y corrige el problema por el que las conversaciones cortas no podían desplazarse en el teléfono.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Aviso en caso de fallo:</strong> si se cierra la página después de enviar un mensaje y el servidor no consigue completar la respuesta ni escribir el error en la conversación, al reabrir la conversación se muestra una explicación después del mensaje del usuario (por ejemplo, «El servidor no pudo terminar esta respuesta»). Cada fallo se muestra una sola vez y, una vez eliminado, no vuelve a aparecer.</li><li><strong>Apertura más fluida de Configuración:</strong> antes, cada vez que se abría Configuración, el contenido se volvía a crear mientras la pantalla se deslizaba (algo especialmente visible la primera vez), lo que en el teléfono se manifestaba como parpadeo. Ahora, la primera vez se espera a que el contenido esté creado antes de deslizar la pantalla y, en las aperturas posteriores, ya no se vuelve a crear.</li><li><strong>Las conversaciones cortas pueden desplazarse:</strong> antes, las conversaciones con solo uno o dos mensajes no podían desplazarse en el iPhone. Ahora funcionan igual que las largas: la pantalla sigue el movimiento del dedo y rebota al soltar.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Solo se añaden las respuestas que fallaron en las últimas 24 horas y después del último mensaje del usuario.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.9.1": [
    "<strong>Notas de la versión de Noureon 17.9.1</strong>",
    "Esta versión corrige el problema por el que, al generar una imagen en el servidor, la imagen se completaba pero no se mostraba en la conversación.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Corrección de imágenes que no se mostraban:</strong> en la generación de imágenes en el servidor de la versión 17.9.0, la posición del mensaje se calculaba de forma incorrecta al escribir la imagen en la conversación y coincidía con la del mensaje del usuario, por lo que la imagen no podía escribirse. Ahora la imagen se escribe después del mensaje del usuario y sigue viéndose al cerrar y volver a abrir la página.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Las solicitudes de imagen enviadas durante la versión 17.9.0 que fallaron deben volver a enviarse.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.9.0": [
    "<strong>Notas de la versión de Noureon 17.9.0</strong>",
    "Esta versión permite generar imágenes en el servidor: tras el envío, la imagen se completa aunque se cierre la página o se bloquee el teléfono, y al volver a abrirla ya está escrita en la conversación. También corrige el ajuste «Respuestas en este dispositivo».",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>La generación de imágenes se realiza en el servidor:</strong> con la sesión iniciada en una cuenta en la nube, la generación de imágenes se ejecuta por defecto en el servidor de Noureon. Tras el envío se puede cerrar la página, bloquear el teléfono o cambiar a otro dispositivo; cuando la imagen está lista, aparece automáticamente en la conversación. Si se reabre la página mientras está en curso, se muestra «Creando la imagen» y no se genera de nuevo. Se puede pulsar «Detener» en cualquier momento.</li><li><strong>Se elimina la vista previa:</strong> la vista previa progresiva de los modelos de imagen GPT se ha eliminado; durante la generación solo se muestra «Creando la imagen» y la imagen completa aparece al terminar.</li><li><strong>El ajuste «Respuestas en este dispositivo» ahora surte efecto:</strong> antes, aunque se eligiera «Este dispositivo» en la pestaña Privacidad de Configuración, las respuestas de texto seguían tratándose en el servidor; ahora, al elegir este dispositivo, tanto las respuestas de texto como la generación de imágenes se realizan únicamente en este navegador.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>La generación de imágenes en el servidor requiere una cuenta en la nube. Si se elige «Este dispositivo», no se ha iniciado sesión, se trata de un chat temporal o las imágenes de referencia adjuntas son demasiado grandes (más de 25 MB), la imagen se sigue generando en el navegador. Si no es posible conectar con el servidor, también pasa automáticamente a generarse en este dispositivo.</li><li>El servidor guarda cifrada de forma temporal la clave de OpenRouter y la elimina al terminar la generación de la imagen, con un máximo de conservación de 30 minutos; las instrucciones y las imágenes de referencia pasan por el servidor y la imagen terminada se guarda en el espacio en la nube del propio usuario (consulte la página de privacidad y la política de privacidad).</li><li>Si el servidor se reinicia durante la generación de la imagen, la solicitud podría enviarse de nuevo una vez, y la cuenta de OpenRouter podría cobrarse dos veces.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.8.2": [
    "<strong>Notas de la versión de Noureon 17.8.2</strong>",
    "Esta versión añade el modelo de generación de imágenes FLUX.3 Image (Black Forest Labs) y admite más proporciones y calidades de imagen.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>FLUX.3 Image:</strong> aparece en el menú de modelos, bajo Black Forest Labs. Puede tomar como referencia hasta 10 imágenes a la vez para editar o combinar, y genera directamente imágenes de hasta 4K.</li><li><strong>Más calidades y proporciones:</strong> FLUX.3 Image ofrece cinco calidades (768, 1K, 1.5K, 2K y 4K) y 15 proporciones, entre ellas 1:1, 16:9, 9:16, 3:2, 4:3, 7:5, 5:7, 9:21 y 21:9. Las calidades 768 y 1.5K y las proporciones 7:5 y 5:7, que son nuevas, solo aparecen en el menú para los modelos que las admiten.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Se requiere una clave de OpenRouter; FLUX.3 Image se cobra por imagen y cuanto mayor es la calidad, mayor es el coste (4K es claramente más caro que 1K), por lo que conviene vigilar el consumo.</li><li>FLUX.3 Image no admite el ajuste «Semilla»; introducir una semilla en la configuración avanzada puede provocar un fallo.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.8.1": [
    "<strong>Notas de la versión de Noureon 17.8.1</strong>",
    "Esta versión sustituye el modelo de generación de imágenes de Google por el más reciente, Nano Banana 2.1, y muestra en Configuración cómo se almacenan actualmente los datos.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Nuevo modelo de generación de imágenes:</strong> Gemini 3.1 Flash Image, Gemini 3.1 Flash Lite Image y Gemini 3 Pro Image se han unificado en «Gemini Nano Banana 2.1». Admite las proporciones 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9 y 21:9, así como proporciones muy estrechas o muy anchas como 1:4, 4:1, 1:8 y 8:1; las calidades son tres: 1K, 2K y 4K.</li><li><strong>Cambio automático al nuevo modelo:</strong> las conversaciones y los ajustes que usaban el modelo anterior pasan automáticamente al nuevo; la calidad 512 seleccionada anteriormente cambia a 1K, porque el nuevo modelo no tiene 512.</li><li><strong>Configuración muestra el método de almacenamiento:</strong> en la parte inferior de Gestión de datos se añade una línea de texto pequeño que indica que los datos usan el almacenamiento por separado; si no aparece esta línea, se sigue usando el método de almacenamiento anterior.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>La generación de imágenes requiere una clave de OpenRouter; las calidades 2K y 4K cuestan más que 1K.</li><li>Google dejará de ofrecer el antiguo Gemini 3.1 Flash Image el 29 de octubre de 2026; esta actualización ya ha cambiado al nuevo modelo, por lo que el usuario no tiene que hacer nada.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.8.0": [
    "<strong>Notas de la versión de Noureon 17.8.0</strong>",
    "Esta versión mejora la velocidad y el uso de memoria al abrir la página web: en las cuentas con grandes volúmenes de datos (en especial las que contienen muchas imágenes), la apertura ya no se ralentiza ni consume memoria en exceso.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Apertura más rápida y con menor uso de memoria:</strong> las conversaciones ya no se guardan combinadas en un único conjunto, sino por separado, una por conversación, y se leen una a una al abrir, en lugar de cargar todos los datos en memoria a la vez.</li><li><strong>Imágenes y archivos adjuntos por separado:</strong> las imágenes y los archivos de las conversaciones ya no se guardan junto con el texto, lo que hace la pantalla más fluida y el guardado más rápido.</li><li><strong>Guardado más ligero:</strong> solo se vuelven a guardar las conversaciones que han cambiado, en lugar de reescribir todos los datos cada vez.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>La primera vez que se abre tras la actualización se tardan unos segundos en reorganizar los datos con el nuevo método de almacenamiento; conviene esperar a que aparezca la pantalla antes de operar. En las cuentas con grandes volúmenes de datos puede tardar más.</li><li>Una vez terminada la reorganización, se realiza una comprobación y solo se activa el nuevo método si todo es correcto; si falla, se sigue usando automáticamente los datos originales, sin pérdida de información.</li><li>Los datos antiguos originales se conservarán al menos 30 días más y solo se eliminarán automáticamente después de comprobar que todo funciona con normalidad.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización reorganiza los datos una vez de forma automática en el dispositivo del usuario, sin necesidad de ninguna operación manual; la sincronización en la nube y la memoria funcionan como siempre, y el uso entre dispositivos no se ve afectado."
  ],
  "17.7.0": [
    "<strong>Notas de la versión de Noureon 17.7.0</strong>",
    "Esta versión añade las «herramientas CLI»: permiten que la IA use programas de línea de comandos como OfficeCLI y FFmpeg en un entorno aislado del servidor, y los archivos generados se muestran debajo de la respuesta.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Tienda de herramientas CLI:</strong> la barra lateral izquierda incluye «CLI» (dirección noureon.com/cli). Se ofrecen oficialmente OfficeCLI (Word, Excel, PowerPoint), FFmpeg (audio y vídeo), yt-dlp (descarga de audio y vídeo), csvkit (CSV), Pandoc (conversión de documentos), SoX (audio), twitter-cli y rdt-cli. Tras añadir una herramienta con «＋», se puede elegir escribiendo @ en el cuadro de entrada; la página de detalles de cada herramienta explica su uso y sus limitaciones.</li><li><strong>Consulta antes de conectarse a la red:</strong> cuando una herramienta quiere conectarse a un sitio web, la primera vez para cada sitio se pregunta «Permitir esta vez, Permitir siempre, Rechazar»; las direcciones internas nunca pueden conectarse.</li><li><strong>Nuevo ajuste «Permisos»:</strong> permite establecer cómo se pregunta por el acceso a la red, administrar las reglas de cada sitio, dejar que la IA use por sí sola una herramienta y guardar las credenciales de inicio de sesión que necesitan las herramientas (credenciales seguras, guardadas cifradas, que pueden volver a consultarse y eliminarse).</li><li><strong>Revisión visual:</strong> se amplía el tiempo de espera para revisar y rehacer presentaciones, lo que reduce los casos en que el resultado queda sin cambios por haberse agotado el tiempo.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Las herramientas CLI requieren una cuenta en la nube y se usan dentro de las respuestas del servidor.</li><li>twitter-cli y rdt-cli requieren que el usuario aporte sus propias credenciales de inicio de sesión; las condiciones de servicio de X y Reddit no permiten el acceso automatizado, por lo que la cuenta podría verse limitada. Al usar yt-dlp, el usuario debe cumplir las condiciones de cada sitio y los derechos de autor.</li><li>En la parte inferior de Configuración pueden consultarse el software de terceros y las licencias.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos en el lado del usuario; los ajustes nuevos se sincronizan con la configuración en la nube."
  ],
  "17.6.0": [
    "<strong>Notas de la versión de Noureon 17.6.0</strong>",
    "Esta versión añade la «Investigación profunda»: al indicar un tema, el sistema redacta primero un plan de investigación, después busca y lee por su cuenta un gran número de páginas web y, por último, genera un informe completo con citas. La investigación continúa en el servidor aunque se cierre la página.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Investigación profunda:</strong> se elige «Investigación profunda» en el menú «＋» del área de entrada. Tras el envío se muestra primero el plan de investigación; al terminar la cuenta atrás comienza la investigación, o bien se puede pulsar «Editar» para modificar el plan o «Iniciar» para comenzar de inmediato.</li><li><strong>Visualización del progreso:</strong> durante la investigación se muestran el porcentaje de progreso y el paso en curso; se puede pausar o detener, y en cualquier momento se pueden añadir instrucciones en el cuadro de entrada, de modo que la investigación posterior se ajusta a ellas.</li><li><strong>Informe completo:</strong> el informe incluye citas y puede leerse en pantalla completa, con el índice a la izquierda y, a la derecha, las fuentes y el proceso de investigación; cuando hay datos, se añaden gráficos. Puede descargarse en PDF, Word o Markdown.</li></ul>",
    "<strong>Notas</strong>",
    "<ul><li>Se requieren una cuenta en la nube y una clave de búsqueda en Configuración; por ahora no se admiten los modelos Gemini.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos."
  ],
  "17.5.0": [
    "<strong>Notas de la versión de Noureon 17.5.0</strong>",
    "Esta versión permite generar las respuestas en el servidor de Noureon: tras el envío, la respuesta se completa aunque se cierre la página, se bloquee el teléfono o se cambie a otro dispositivo, y al volver a abrirla ya está escrita en la conversación. Configuración incorpora la pestaña «Privacidad», donde se puede elegir si las respuestas se generan en el servidor o en este dispositivo.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Respuestas del servidor:</strong> por defecto, las respuestas se generan en el servidor (se requiere una cuenta en la nube). La respuesta se sincroniza a medida que se escribe: con la página abierta se muestra letra a letra como siempre y los demás dispositivos la ven en tiempo real; al pulsar «Detener» se avisa al servidor para que pare y se conserva lo ya escrito; cada usuario puede tener como máximo 5 respuestas a la vez, cada una de hasta 2 horas; cuando el servidor se actualiza o reinicia, las respuestas en curso continúan automáticamente desde el último punto guardado.</li><li><strong>Sincronización en tiempo real y continuación:</strong> el servidor envía al instante a todas las pestañas y dispositivos abiertos cada fragmento de texto de la respuesta, el proceso de razonamiento y las páginas web encontradas, de modo que todos ven el mismo contenido al mismo tiempo; si se cierra la página, se cambia a otra pestaña o a otra conversación y se vuelve mientras la respuesta aún se está generando, primero se muestra el progreso actual y después se sincroniza con las demás pestañas para seguir mostrándola; lo que ya está escrito es la respuesta completa. Si no es posible conectar con el canal en tiempo real, se pasa automáticamente a leer los mensajes guardados.</li><li><strong>Siempre salida en tiempo real:</strong> se eliminan de Configuración el «Modo de salida» y «Máquina de escribir tras la salida completa»; las respuestas se muestran siempre a medida que se generan, y quienes usaban la máquina de escribir pasan automáticamente a la salida en tiempo real.</li><li><strong>Python también se ejecuta en el servidor:</strong> las respuestas del modo Avanzado que necesitan ejecutar Python (procesar archivos y datos, generar Word, PowerPoint, Excel, PDF y gráficos) se ejecutan ahora en un contenedor del servidor aislado del exterior: sin conexión a la red, con memoria y tiempo limitados, y eliminado al terminar la respuesta. La lista de pasos se muestra en tiempo real en cada pestaña y la respuesta se completa aunque se cierre la página; los archivos de Word y PowerPoint generados incorporan las fuentes de código abierto que proporciona Noureon, por lo que no se desajustan al abrirlos en otro equipo; los archivos generados se guardan en el espacio en la nube del propio usuario y se muestran debajo del mensaje al reabrirlo. Los archivos anteriores de la conversación también se envían solo como ubicación en la nube, sin volver a subirse en cada envío.</li><li><strong>Cuando falla el entorno aislado:</strong> si no es posible conectar con el VPS o el entorno aislado no está disponible, las respuestas de Python pasan automáticamente a ejecutarse en el navegador del usuario; si se produce una desconexión breve durante la ejecución, se reintenta automáticamente con un entorno aislado nuevo; si el reintento sigue fallando, la página sigue abierta y el modelo aún no ha escrito la respuesta, también se devuelve al navegador para rehacerla.</li><li><strong>La revisión visual se realiza en el servidor:</strong> cuando una respuesta escribe una presentación, el servidor dibuja automáticamente las diapositivas como imágenes y pide al modelo que las revise visualmente; si hay problemas, los corrige (en el caso de las presentaciones hechas con Python, pide al modelo que las rehaga) y escribe el resultado como una nueva respuesta. Se completa aunque se cierre la página; todas las pestañas y dispositivos ven la misma barra de progreso, durante este tiempo ninguna pestaña puede enviar mensajes y se puede interrumpir con «Detener». Si el servidor no puede dibujar las imágenes, la revisión se sigue haciendo en el navegador como antes.</li><li><strong>Pestaña Privacidad:</strong> enumera dónde se ejecutan las respuestas, qué se envía al elegir el servidor, las funciones que por ahora se ejecutan siempre en el dispositivo y dónde se almacenan los datos. Las claves de API se guardan cifradas de forma temporal solo hasta que termina la respuesta (como máximo 2 horas y 15 minutos), no se conservan a largo plazo y no aparecen en los registros ni en los mensajes de error.</li><li><strong>Vuelta automática al dispositivo:</strong> si no es posible conectar con el servidor, hay demasiadas respuestas simultáneas o la respuesta usa la búsqueda web de un modelo que no admite llamadas a herramientas, la respuesta se genera automáticamente en este dispositivo; cuando no se puede conectar o el servidor está demasiado ocupado, se muestra un breve aviso.</li></ul>",
    "<strong>Limitaciones conocidas</strong>",
    "<ul><li>La búsqueda web de los modelos que no admiten llamadas a herramientas, la entrada de voz y la cámara se ejecutan por ahora siempre en el dispositivo.</li><li>Hay un límite de respuestas de Python simultáneas; las que lo superan esperan en cola.</li><li>Las respuestas sin sesión iniciada en una cuenta en la nube y las de los chats temporales también se generan en el dispositivo.</li><li>Cuando el servidor se actualiza, la transmisión del modelo en curso se rehace una vez.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. Tras actualizar, las respuestas se generan por defecto en el servidor; quien necesite mantenerlas en el dispositivo puede elegir «Este dispositivo» en «Configuración → Privacidad». Los dispositivos que aún no se han actualizado pueden seguir mostrando con normalidad las respuestas escritas por el servidor."
  ],
  "17.4.0": [
    "<strong>Notas de la versión de Noureon 17.4.0</strong>",
    "Esta versión permite que los modelos que usan herramientas busquen en internet y lean páginas web por sí mismos, e incorpora citas en línea: en el punto citado de la respuesta aparece una pequeña etiqueta del sitio, debajo hay un botón de fuentes y la barra lateral derecha añade dos pestañas, Cronología y Fuentes.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>El modelo busca por sí mismo:</strong> los modelos que llaman a herramientas (incluido el modo Avanzado) pueden, dentro de la respuesta, buscar, abrir páginas web y localizar texto en páginas largas, con un máximo de veinte llamadas, y deciden por sí mismos si buscar o no; las búsquedas y páginas que se necesitan en una misma ronda se obtienen juntas, si falla una fuente de búsqueda se usa otra, el contenido buscado recientemente se guarda temporalmente y los resultados de búsqueda incluyen la fecha de los datos. Las consultas de búsqueda las redacta ahora el modelo que responde, a partir de la conversación.</li><li><strong>Citas en línea:</strong> después de las frases citadas de la respuesta aparece una pequeña etiqueta gris de esquinas redondeadas (con el icono y el nombre del sitio; si hay varias fuentes se muestra «nombre del sitio +1»). Si solo hay una fuente, un clic la abre directamente en una pestaña nueva; si hay varias, se abre el panel inferior «N fuentes». Se marcan citas tanto en las fuentes de la búsqueda integrada del modelo como en los modelos que llaman a herramientas y en los modelos normales. Al copiar la respuesta no se incluyen las marcas de cita ni el registro de ejecución.</li><li><strong>Botón de fuentes y pestaña Fuentes:</strong> debajo de las respuestas con fuentes, junto al botón de copiar, se añade el botón «Fuentes» (tres iconos de sitio superpuestos): en el teléfono abre un panel inferior y en el ordenador abre la pestaña Fuentes de la barra lateral derecha. Cada fila de fuente muestra el icono del sitio y el nombre que el propio sitio declara, el título, la fecha y un resumen de dos líneas; las fuentes se abren directamente, sin ventana de confirmación, y también se han eliminado los avisos relacionados.</li><li><strong>Barra lateral derecha:</strong> «Índice de mensajes» pasa a llamarse «Cronología» y, junto con «Fuentes», forma dos pestañas; es más ancha; en el ordenador (1024 px o más) comprime la página del chat al abrirse, sin velo blanco, y permanece abierta hasta que se pulsa cerrar, Esc o el nuevo botón de panel a la derecha de la barra de título. Se elimina el comportamiento anterior de aparecer al acercar el ratón al borde de la pantalla, porque esa zona sensible cubría la barra de desplazamiento del chat. La cronología pasa a mostrar puntos en blanco y negro unidos por una línea fina, con el interlocutor y hasta tres líneas de contenido, y ya no muestra símbolos de marcado como negrita o títulos (salvo en las tablas). Con el panel abierto se actualiza junto con la conversación: se redibuja automáticamente al cambiar de conversación, al completarse una respuesta y tras editar o eliminar.</li><li><strong>Panel de fuentes en el teléfono:</strong> ocupa todo el ancho, queda pegado a la parte inferior de la pantalla, sigue el arrastre del dedo solo mediante desplazamiento, puede estirarse casi hasta pantalla completa y se cierra tirando hacia abajo.</li><li><strong>Visualización de direcciones:</strong> en el cuadro de entrada y en los mensajes enviados, las direcciones web se muestran como el icono del sitio y un enlace breve.</li></ul>",
    "<strong>Correcciones y mejoras</strong>",
    "<ul><li><strong>Barras de desplazamiento:</strong> en todo el sitio pasan a un estilo unificado: finas, con control deslizante gris de esquinas redondeadas y sin color de fondo de pista. Las flechas de los extremos de las barras verticales, al pulsarse, desplazan con una animación de 0,5 s hasta el principio o el final; el área de entrada ya no cubre la parte inferior de la barra de desplazamiento del chat.</li><li><strong>Degradados:</strong> se añade un degradado de desvanecimiento bajo el campo de búsqueda y sobre la fila de la cuenta en la barra lateral izquierda, y bajo las pestañas y en la parte inferior de la barra lateral derecha, de modo que el contenido ya no queda cortado por una línea al desplazarse.</li><li><strong>Resaltado de fuentes y cronología:</strong> la fila sobre la que se detiene el ratón sigue el desplazamiento al instante, sin esperar a que termine; la cronología ya no tiene un fondo gris atascado.</li><li><strong>Botones de las barras laterales:</strong> se corrige que, con la barra lateral derecha abierta (ventana de menos de 1024 px), pulsar el botón de menú de arriba a la izquierda cerrara la barra derecha pero no abriera la izquierda; y se corrige que, tras plegar la barra derecha en el ordenador, el velo transparente siguiera cubriendo la página del chat e impidiera hacer clic en ella.</li></ul>",
    "<strong>Limitaciones conocidas</strong>",
    "<ul><li>El nombre y la fecha de las fuentes dependen de los datos que proporcionan cada sitio y el servicio de búsqueda; si algunos sitios no tienen nombre, se muestra la dirección.</li><li>La pestaña «Fuentes» de la barra lateral derecha solo enumera las fuentes de la última respuesta que tiene fuentes, o de la respuesta que el usuario ha pulsado; no es una lista combinada de toda la conversación.</li><li>Las flechas de los extremos de las barras de desplazamiento las dibuja el navegador y solo aparecen en los navegadores de algunos sistemas de ordenador; en el teléfono no aparecen.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. El registro de ejecución de las respuestas añade los campos de número, fecha y resumen de las fuentes, que se guardan con el mensaje; los dispositivos que aún no se han actualizado ignoran estos campos y siguen mostrando las filas de fuentes con el estilo anterior. Las conversaciones, la memoria y los datos sincronizados existentes no se ven afectados."
  ],
  "17.3.1": [
    "<strong>Notas de la versión de Noureon 17.3.1</strong>",
    "Esta versión reduce a una línea los pasos en curso, añade varias correcciones de la revisión visual y de la edición, y hace que el icono de sitio de la barra de búsqueda pase al siguiente cuando el primer sitio no tiene icono.",
    "<strong>Correcciones y mejoras</strong>",
    "<ul><li><strong>Pasos en curso:</strong> al elaborar una respuesta, el proceso se reduce a una línea que indica en qué punto va; solo al desplegarla se ven los pasos (en Configuración puede cambiarse para que aparezca desplegada por defecto); el razonamiento del modelo pasa a ser un paso dentro de «En curso» y, al terminar, el cronómetro del paso se detiene. Cuando el modelo permanece en silencio un rato, se muestra «Escribiendo el código…» y lo que dijo durante ese silencio se despliega poco a poco en lugar de aparecer de golpe. Las respuestas que solo buscan en la web, sin ejecutar código, también tienen la misma línea de «Procesado en». La finalidad de cada paso se explica ahora mediante el campo note de la llamada, y ya no se emite un texto antes de la llamada, por lo que cada palabra emitida forma parte de la respuesta y se muestra en cuanto aparece.</li><li><strong>Revisión visual:</strong> la captura de las diapositivas se realiza una vez cargadas las fuentes, de modo que las imágenes que ve el modelo contienen texto; cuando no se puede leer la respuesta de la revisión visual, se vuelve a consultar al modelo sin límite de longitud y se explica el motivo en cada idioma; el mensaje al que pertenece la revisión se localiza en la conversación en vivo mediante el número de mensaje, lo que corrige que las presentaciones rehechas tras recargar se descartaran y que, al no encontrar el mensaje, se descartara el resultado por error.</li><li><strong>Iconos de sitio:</strong> el servidor del propio sitio obtiene ahora los iconos (sin pasar por servicios de iconos de terceros); los sitios sin icono ya no muestran un espacio en blanco; el icono de la barra de búsqueda pasa al siguiente sitio cuando el primero no tiene, hasta encontrar uno.</li><li><strong>Edición y envío:</strong> las conversaciones truncadas por una edición permanecen truncadas (se marca el punto de truncamiento y tiene prioridad sobre las copias más largas; los mensajes posteriores al truncamiento se eliminan también en la nube mediante sincronización); antes de truncar por edición se detienen la respuesta y la revisión visual; el aviso de envío bloqueado se muestra completo.</li><li><strong>Otros:</strong> la marca «[File: nombre de archivo]» incluida en las respuestas se elimina cuando hay una tarjeta de archivo, y se recuerda al modelo que no la escriba; la flecha de la fila plegada en el teléfono vuelve a girar; el chat sigue pudiendo desplazarse cuando el contenido es demasiado corto; el botón de cerrar de la vista previa de archivos ya no tiene contorno de foco. En la configuración de sincronización en la nube se añaden el botón «Sincronizar ahora» y el estado de sincronización de cada tipo de datos.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos; las conversaciones, la memoria y los datos sincronizados existentes no se ven afectados."
  ],
  "17.3.0": [
    "<strong>Notas de la versión de Noureon 17.3.0</strong>",
    "Esta versión permite elegir Tavily o el gratuito TinyFish para la búsqueda web de los modelos de OpenRouter y NVIDIA, y añade la lectura de las direcciones incluidas en los mensajes; además incorpora la retirada automática de modelos al vencer, el bloqueo del envío durante la revisión visual y un nuevo ajuste del desplazamiento en la parte inferior del chat del iPhone.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Fuente de búsqueda a elegir:</strong> en Configuración se añade «Fuente de búsqueda», con Tavily o TinyFish; solo se necesita la clave de API de la fuente elegida; al elegir TinyFish se muestran el campo de la clave de TinyFish y el enlace para solicitarla. El valor predeterminado sigue siendo Tavily y los ajustes existentes no se ven afectados.</li><li><strong>Lectura de las direcciones de los mensajes:</strong> los modelos de OpenRouter y NVIDIA no pueden abrir enlaces por sí mismos; cuando un mensaje contiene direcciones, la aplicación lee primero el texto de la página y se lo entrega al modelo. Se usa de preferencia la función de lectura de la fuente de búsqueda elegida (Tavily Extract o TinyFish Fetch); las páginas para las que no hay clave o que no pueden leerse se leen con la otra fuente, por lo que basta con tener una de las dos claves. Se leen como máximo 5 direcciones por vez, hasta 15 000 caracteres por página, con un total máximo de unos 45 000 caracteres.</li><li><strong>Las direcciones activan la búsqueda:</strong> cuando un mensaje contiene una dirección, se activa la búsqueda web para esa solicitud con independencia del ajuste de búsqueda automática (si el modelo puede buscar y la clave está configurada), y se muestra un aviso de activación automática; el interruptor de búsqueda de la propia conversación no cambia.</li><li><strong>Resultados de lectura y explicación de fallos:</strong> encima de la respuesta se añade la fila de fuentes «N páginas leídas», separada de «N sitios consultados». Cuando no se puede leer una dirección, o no hay ninguna clave de lectura configurada, se informa al modelo y se le pide que lo explique al usuario con sinceridad, sin suponer el contenido de la página. El consejo también lee las direcciones y las entrega a los miembros de la primera ronda y al modelo de síntesis.</li><li><strong>Retirada automática de modelos al vencer:</strong> los modelos con fecha de retirada se eliminan automáticamente de la lista de modelos el día del vencimiento, y las conversaciones y los ajustes guardados que usaban ese modelo pasan al modelo predeterminado, sin necesidad de retirarlo manualmente. Se añade el modelo de prueba Space Bunny Alpha (OpenRouter, gratuito, admite imágenes y vídeo como entrada y razonamiento de nivel bajo a máximo), cuya retirada está prevista para el 2026-10-05; la fecha de retirada se muestra en el menú.</li><li><strong>Envío bloqueado durante la revisión visual:</strong> mientras se realiza la revisión visual automática de una presentación, esa conversación no puede enviar mensajes nuevos y el cuadro de entrada indica el motivo; el bloqueo se levanta de inmediato cuando termina la revisión o se pulsa «Detener».</li></ul>",
    "<strong>Correcciones</strong>",
    "<ul><li><strong>Desplazamiento en la parte inferior del chat del iPhone:</strong> se elimina el detector de eventos táctiles que servía para impedir el zoom con dos dedos y que podía retrasar el desplazamiento cuando la página estaba ocupada (se usan ahora los eventos de gestos de Safari); cuando se pierde la señal de que el dedo se ha levantado, la protección del desplazamiento ya no cree por error que el dedo sigue pulsando; el chat y los cuadros de razonamiento, código y salida conservan un pequeño margen de desplazamiento adicional en la parte más inferior, de modo que un desplazamiento que empieza desde el fondo funciona con normalidad.</li><li><strong>Espaciado de la fila de razonamiento:</strong> se corrige que la flecha de despliegue y los segundos aparecieran pegados.</li></ul>",
    "<strong>Limitaciones conocidas</strong>",
    "<ul><li>La lectura de direcciones depende del servicio de Tavily o TinyFish; los PDF, los sitios que requieren iniciar sesión o que bloquean la lectura automática pueden no poder leerse, y en ese caso el modelo lo comunica con sinceridad.</li><li>En consultas complejas y de múltiples condiciones, según evaluaciones de terceros, la búsqueda de TinyFish puede ser inferior a la búsqueda avanzada de Tavily; el formato de respuesta de TinyFish y de Tavily Extract se ha implementado según su documentación, y si el resultado de la lectura es anómalo, se ruega notificarlo.</li><li>Si el desplazamiento en el iPhone sigue teniendo problemas, se ruega notificarlo adjuntando una grabación de pantalla.</li><li>Space Bunny Alpha es un modelo de prueba anónimo y el proveedor puede ajustar su comportamiento antes de retirarlo.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. Configuración añade el campo de fuente de búsqueda y la clave de TinyFish; si no se configuran, se mantiene Tavily. La clave de TinyFish figura como ajuste sensible igual que las demás claves de API y se oculta al exportar. El registro de ejecución de las respuestas añade la marca «leído» en las fuentes, que los dispositivos aún no actualizados ignoran."
  ],
  "17.2.1": [
    "<strong>Notas de la versión de Noureon 17.2.1</strong>",
    "Esta versión actualiza Claude Sonnet 5 y OpenAI GPT-6 Sol en OpenRouter a los más recientes Claude Sonnet 5.5 y GPT-6.1 Sol.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Claude Sonnet 5.5:</strong> sustituye a Claude Sonnet 5. El precio se mantiene en 2 USD por millón de tokens de entrada y 10 USD por millón de tokens de salida; admite imágenes y archivos como entrada; el razonamiento tiene cinco niveles (Bajo, Medio, Alto, Muy alto y Máximo), con Alto como valor predeterminado.</li><li><strong>OpenAI GPT-6.1 Sol:</strong> sustituye a OpenAI GPT-6 Sol. El precio se mantiene en 2 USD por millón de tokens de entrada y 10 USD por millón de tokens de salida; admite imágenes y archivos como entrada. El razonamiento pasa a tener los niveles Bajo, Medio, Alto, Muy alto y Máximo, ya no se ofrece el «modo Rápido» y el valor predeterminado es Medio.</li><li><strong>Modo Avanzado con GPT-6.1 Sol:</strong> la documentación de OpenAI indica que las llamadas a herramientas de este modelo requieren la API Responses, por lo que en cada ronda de una respuesta en modo Avanzado (Python) pasa a usar la API Responses de OpenRouter; los resúmenes del razonamiento se siguen mostrando en tiempo real y el razonamiento y las llamadas a herramientas del modelo se devuelven tal cual entre una ronda y otra; las conversaciones normales, el modo Estándar y los demás modelos mantienen el método de llamada anterior.</li><li><strong>Conversaciones existentes:</strong> las conversaciones que usaban Sonnet 5 o GPT-6 Sol, los grupos del consejo de modelos y los modelos usados recientemente pasan automáticamente a la versión nueva; si una conversación de GPT-6 Sol estaba configurada en «modo Rápido», pasa al valor predeterminado «Medio».</li></ul>",
    "<strong>Limitaciones conocidas</strong>",
    "<ul><li>La ruta de la API Responses que GPT-6.1 Sol usa en el modo Avanzado se ha implementado según la documentación de OpenAI y OpenRouter; si en el modo Avanzado aparece un error, se ruega notificar el mensaje de error.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos; las conversaciones, la memoria y los datos sincronizados existentes no se ven afectados."
  ],
  "17.2.0": [
    "<strong>Notas de la versión de Noureon 17.2.0</strong>",
    "Esta versión convierte la ejecución del modo Avanzado en un panel de procesamiento de un paso por línea, añade la fila de fuentes de la búsqueda web y permite que Gemini use a la vez la búsqueda integrada y Python.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Panel de procesamiento:</strong> encima de la respuesta se muestra una línea «Procesado en 10m 28s» que, al desplegarse, muestra cada paso como una línea de texto gris que puede desplegarse por separado. Los pasos de código van precedidos de un icono de terminal, la búsqueda tiene un icono de globo terráqueo y el razonamiento solo lleva texto. El tiempo del título es el tiempo total de toda la respuesta (búsqueda, razonamiento, ejecución y procesamiento de archivos); en las respuestas antiguas se usa la suma de los tiempos de cada paso y del razonamiento. Las respuestas con solo razonamiento y sin otros pasos mantienen la línea «Razonamiento» original.</li><li><strong>Contenido de los pasos:</strong> al desplegar cada paso de código, el código aparece en una tarjeta clara; sobre la tarjeta figura «Python» y un botón de copiar, el código se colorea según su sintaxis y se desplaza horizontalmente cuando es demasiado largo; la salida se muestra debajo de la tarjeta y los pasos fallidos se marcan en rojo. Los pasos plegados no muestran la flecha de despliegue, que solo aparece al pasar el cursor, y al desplegarse apunta hacia abajo; los dispositivos táctiles no tienen estado de paso del cursor, por lo que no se muestra la flecha cuando están plegados. Los nombres de los pasos ya no indican «la vez N».</li><li><strong>Coherencia entre la visualización en vivo y el guardado:</strong> la lista de pasos durante la respuesta y el panel de procesamiento guardado usan el mismo estilo, de modo que lo que se ve coincide con lo que se ve al reabrir. El panel guardado se despliega y pliega con una animación suave y respeta el ajuste del sistema «Reducir movimiento».</li><li><strong>Explicaciones entre pasos:</strong> lo que el modelo dice antes de ejecutar código se muestra como texto normal entre los pasos, ya no se mezcla con la respuesta final, y se guarda con la respuesta. Se añade una instrucción de sistema: antes de cada llamada a una herramienta de ejecución, explicar en una frase qué se va a hacer y por qué. Los primeros 400 caracteres de cada ronda de respuesta se guardan temporalmente para determinar si se trata de una explicación o de la respuesta; las respuestas cortas aparecen de una vez al terminar la ronda, y las largas se transmiten como de costumbre.</li><li><strong>Razonamiento plegado por defecto:</strong> el razonamiento en curso ya no se despliega automáticamente, sino que el usuario lo despliega cuando lo necesita; un razonamiento ya desplegado no se cierra cuando llega contenido nuevo. Lo mismo se aplica a la línea «Pensando…» del modo Estándar.</li><li><strong>Fuentes de búsqueda:</strong> en las respuestas que usan la búsqueda de Tavily o la integrada de Gemini, el panel de procesamiento muestra «N sitios consultados», que se despliega en pequeños iconos de sitio y nombres de dominio. Al pulsar una fuente se muestra primero una ventana de confirmación y solo tras confirmar se abre en una pestaña nueva; la ventana tiene una casilla «No volver a avisar», cuya elección solo se guarda en este dispositivo. Los iconos pequeños los obtiene el navegador directamente de /favicon.ico del sitio y, si no se obtienen, se muestra un icono de globo terráqueo. Solo se aceptan direcciones http y https. Gemini devuelve redirecciones de Google, por lo que se muestra el nombre de dominio que proporciona.</li><li><strong>Gemini busca y ejecuta Python a la vez:</strong> Gemini no permite que la búsqueda integrada y las herramientas de funciones aparezcan en la misma solicitud, por lo que antes se volvía al modo Estándar. Ahora se hace primero una búsqueda independiente, se genera un breve resumen y ese resumen se entrega como material de referencia a la ronda que ejecuta Python. Durante la búsqueda, la barra de progreso muestra «Buscando en la web…» y al terminar pasa a «N sitios consultados»; el tiempo de búsqueda se incluye en el tiempo total; si la búsqueda falla, la respuesta continúa con normalidad, solo que sin resumen.</li></ul>",
    "<strong>Otras mejoras</strong>",
    "<ul><li><strong>Respuesta al pulsar:</strong> todos los controles pulsables se hunden ligeramente al pulsarlos y rebotan; los controles desactivados vibran ligeramente al pulsarlos; los estilos al pasar el cursor solo se aplican en dispositivos con cursor.</li><li><strong>Indicador de procesamiento:</strong> los botones que requieren espera (exportar, importar, importar datos en la nube, iniciar sesión y operaciones con imágenes) muestran un indicador giratorio mientras se procesan.</li><li><strong>Archivos:</strong> cuando un bloque de archivo escrito aparte por el modelo tiene el mismo nombre que un documento producido por el sistema de diseño, ya no aparece una tarjeta vacía adicional; los bloques de archivo de Word, PowerPoint, Excel y PDF con contenido vacío ya no se muestran como tarjetas ni generan archivos vacíos.</li></ul>",
    "<strong>Limitaciones conocidas</strong>",
    "<ul><li>Las fuentes de búsqueda solo admiten Tavily y la búsqueda integrada de Gemini; la búsqueda integrada de otros proveedores no se analiza para extraer fuentes. Las fuentes de Gemini solo aparecen después de completarse la respuesta, y las redirecciones de Google podrían dejar de funcionar más adelante.</li><li>La búsqueda de Gemini se realiza una sola vez al principio; durante la ejecución del código, el modelo ya no puede buscar por sí mismo.</li><li>Las explicaciones entre pasos dependen de que el modelo las redacte según las instrucciones.</li><li>Por ahora no hay un interruptor en Configuración para revertir «No volver a avisar»; solo se pueden borrar los datos de este sitio.</li><li>Los bloques de archivo en blanco que el propio modelo escribe en el modo Estándar quedan fuera del alcance de esta actualización.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. El registro de ejecución añade tres campos (tiempo total, fuentes de búsqueda y explicaciones de los pasos), que se guardan con el mensaje; los dispositivos que aún no se han actualizado ignoran estos campos y siguen mostrando los pasos con el estilo anterior. Las conversaciones, la memoria y los datos sincronizados existentes no se ven afectados."
  ],
  "17.1.1": [
    "<strong>Notas de la versión de Noureon 17.1.1</strong>",
    "Esta versión corrige problemas del área de entrada, el selector de modelos, el desplazamiento del chat y la visualización del razonamiento en el teléfono y el iPhone, y ajusta el encabezado.",
    "<strong>Correcciones</strong>",
    "<ul><li><strong>Cuadro de entrada en el teléfono:</strong> pasa a tener dos filas, con la entrada arriba y las herramientas abajo, y se conserva el botón del micrófono; el título de la página de Configuración se conserva y, al volver desde Configuración, el botón de volver regresa a su posición original.</li><li><strong>Selector de modelos en el teléfono:</strong> la posición de apertura coincide con la del selector de «Diseño» y su tamaño es fijo; al buscar y al abrir o cerrar el teclado ya no cambia de tamaño ni vibra; al cerrarlo desde fuera se quita el resaltado del botón de cancelar.</li><li><strong>Entrada de voz:</strong> se amplía la forma de onda durante el dictado.</li><li><strong>Encabezado:</strong> pasa a ser un bloque sólido, delgado y alargado, de altura fija, sin línea separadora, y los mensajes se desvanecen en su borde inferior; la altura ya no cambia según aparezca o no el botón de chat temporal. Al cambiar de conversación, la anterior se desvanece en lugar de cambiar de golpe.</li><li><strong>Desplazamiento del chat (iPhone):</strong> la columna del chat en el teléfono ya no es un segundo contenedor de desplazamiento; un deslizamiento que empieza al final de la conversación permanece en la conversación y ya no rebota hacia abajo. Al abrir una conversación ya no se produce primero un temblor.</li><li><strong>Cuadros de razonamiento y código (iPhone):</strong> se puede desplazar y leer con normalidad mientras la respuesta se transmite, y el contenido no se mueve bajo el dedo; también se puede deslizar directamente hacia arriba cuando está parado en el extremo inferior, y el cuadro de desplazamiento conserva 2 píxeles en ambos extremos. El texto que aparece en la transmisión lo hace con un fundido de entrada y ya no está borroso.</li><li><strong>Visualización del razonamiento:</strong> en el modo Avanzado, al pulsar Detener se conserva el razonamiento ya generado y se marca como «Razonamiento interrumpido», plegado por defecto; al volver a desplegarlo salta a lo más reciente; el razonamiento sigue emitiéndose mientras se lee hacia arriba; la fila de razonamiento responde con un solo toque, sin necesidad de pulsar varias veces.</li><li><strong>Hora y copia de las respuestas:</strong> la hora y la fila de copia de cada respuesta quedan fijas en el extremo derecho.</li><li><strong>Menú de color de las burbujas:</strong> se corrige el plegado anómalo del menú.</li></ul>",
    "<strong>Limitaciones conocidas</strong>",
    "<ul><li>Si el desplazamiento en el iPhone sigue teniendo problemas, se ruega notificarlo adjuntando una grabación de pantalla.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos; las conversaciones, la memoria y los datos sincronizados existentes no se ven afectados."
  ],
  "17.1.0": [
    "<strong>Notas de la versión de Noureon 17.1.0</strong>",
    "Esta versión rediseña la selección de modelos junto al cuadro de entrada, añade grupos con nombre al consejo de modelos y mejora el manejo del razonamiento, la entrada de voz y las notificaciones.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Selector de modelos:</strong> un modelo y el consejo de modelos se unen en un solo botón y un solo panel junto al cuadro de entrada, que sustituyen al menú de modelos del encabezado y al panel del consejo; en la parte superior del panel se alterna entre «Un modelo» y «Consejo». «Un modelo» pasa a ser una lista con búsqueda y agrupada por empresa, sin tener que entrar nivel por nivel en proveedor, categoría, empresa y clasificación; cada fila tiene dos líneas, el precio y la descripción se muestran en una sugerencia y se ven más modelos a la vez.</li><li><strong>Recientes:</strong> en la parte superior de la lista de un modelo y de las listas de miembros y de síntesis del consejo se muestran los tres modelos usados más recientemente; se actualizan al elegir un modelo o enviar un mensaje, el modelo en uso siempre está entre ellos y esos modelos también se conservan en su grupo de empresa original.</li><li><strong>Grupos del consejo:</strong> se pueden guardar hasta cinco grupos, cada uno con nombre, miembros y modelo de síntesis, y basta pulsar uno para aplicarlo; la configuración actual puede guardarse como un grupo nuevo, y en la página de edición se puede cambiar el nombre (máximo 20 caracteres), volver a elegir los miembros y el modelo de síntesis, y eliminarlo. El consenso o el debate no forman parte de los grupos. La etiqueta del consejo en el cuadro de entrada pasa a mostrar solo «Consenso» o «Debate».</li><li><strong>Razonamiento:</strong> sale de la lista de modelos y pasa a ser un botón independiente junto al cuadro de entrada (que muestra el nivel actual en gris) y un panel estrecho. El ajuste pasa a ser un control deslizante por niveles: cada nivel tiene un punto, el botón redondo es más alto que la pista, salta nivel a nivel al arrastrarlo y muestra el nombre del nivel al instante; se guarda al soltar. También se puede manejar con las teclas de flecha, Inicio y Fin, y en los dispositivos con vibración cada salto produce una ligera vibración.</li><li><strong>Entrada de voz:</strong> al pulsar el micrófono, toda la fila del cuadro de entrada pasa a ser una fila de dictado: un «＋» atenuado, una forma de onda que crece según el volumen, y cancelar (✕) y finalizar (✓). Al finalizar, ✓ se convierte en un indicador giratorio y el texto se añade al mensaje original solo cuando termina; Enter finaliza, Esc cancela y Ctrl+Shift+D inicia o finaliza. Al dejar el cursor sobre el micrófono se muestran la sugerencia y el atajo de teclado en el idioma de la interfaz. La entrada de voz de la ventana de búsqueda se mantiene como estaba.</li><li><strong>Notificaciones de la esquina superior derecha:</strong> pasan a ser tarjetas de fondo blanco y borde fino, con un pequeño icono que distingue éxito, advertencia y error, y pueden llevar un botón de acción y un botón de cierre; se muestran como máximo 3 a la vez y el resto espera en cola; un mensaje idéntico solo actualiza el existente; la cuenta atrás se pausa mientras el cursor está encima, la notificación permanece de 3 a 6 segundos y en el teléfono queda pegada al borde superior de la pantalla. El aviso de búsqueda al abrir el consejo de modelos se acorta a una frase y lleva un botón «Activar búsqueda».</li><li><strong>Visualización del razonamiento:</strong> el razonamiento en curso y el finalizado usan el mismo estilo; en el modo Avanzado, cuando el modelo empieza a emitir la respuesta, la fila de razonamiento termina y se pliega, y se registra el tiempo que tardó el razonamiento. También se ajustan las animaciones de transición de plegado y despliegue, de apertura y cierre de paneles y de cambio de página, que respetan el ajuste del sistema «Reducir movimiento».</li></ul>",
    "<strong>Otras mejoras</strong>",
    "<ul><li>Al alternar entre un modelo y el consejo, al elegir un modelo y al guardar un grupo, la pantalla se actualiza primero y el guardado comienza después de dibujarse, sin esperar a que se escriban todas las conversaciones.</li><li>El botón «Diseño» del cuadro de entrada precarga el selector cuando el navegador está inactivo o cuando el cursor o el dedo se acercan; el selector se dibuja una sola vez y se conserva, las miniaturas se dibujan una a una en los momentos libres y, si no han llegado a cargarse, se muestra primero un indicador giratorio; el panel ya no aplica desenfoque de fondo.</li></ul>",
    "<strong>Limitaciones conocidas</strong>",
    "<ul><li>«Recientes» sigue el orden de uso más reciente y no cuenta el número de usos.</li><li>El precio y la descripción se muestran en sugerencias, que no pueden verse en dispositivos táctiles sin cursor.</li><li>La forma de onda de voz requiere permiso de micrófono y que el navegador permita usar el micrófono a la vez que el reconocimiento de voz; en caso contrario, la onda solo se mueve ligeramente y el resto de las funciones no se ve afectado. Si el navegador ocupa Ctrl+Shift+D, se debe pulsar el micrófono.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. Configuración añade los campos «grupos del consejo» y «modelos usados recientemente», que las versiones anteriores ignoran; las conversaciones, la memoria y los datos sincronizados existentes no se ven afectados."
  ],
  "17.0.0": [
    "<strong>Notas de la versión de Noureon 17.0.0</strong>",
    "Esta versión permite que las respuestas de la IA generen y previsualicen directamente archivos de Word, Excel, PowerPoint, PDF y otros, e incorpora el método de creación «Avanzado», que ejecuta Python en el navegador, además de la visualización en tiempo real del razonamiento, los pasos de ejecución y la revisión visual automática.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Archivos descargables:</strong> los archivos de las respuestas de la IA se presentan como tarjetas que pueden previsualizarse y descargarse, y los varios archivos de una misma respuesta pueden obtenerse de una vez con «Descargar todo (ZIP)». Se admiten formatos de texto como Markdown, CSV, JSON y código, así como Word (docx), Excel (xlsx), PowerPoint (pptx) y PDF; los archivos HTML se previsualizan en un entorno aislado. En navegadores distintos de Safari en iPhone, como Chrome, los archivos se guardan mediante el menú de compartir.</li><li><strong>PowerPoint:</strong> 17 diseños, con gráficos y tablas nativos, iconos, notas del orador, imágenes subidas y vista previa de las diapositivas; puede usarse un diseño adaptativo con IA según el contenido, o indicar una de 20 plantillas, en cuyo caso el programa la aplica de forma obligatoria y solo permite ajustar en la conversación el color principal y el secundario.</li><li><strong>Word y PDF:</strong> Word ofrece 9 plantillas y diseño adaptativo con IA, portada e incrustación de fuentes, y puede revisarse con vista previa de páginas; PDF y Word comparten el mismo diseño, todas las fuentes se incrustan en forma de subconjuntos (incluidos chino simplificado, japonés, coreano y emoji en blanco y negro) y se admiten números de página en el índice, marcadores, gráficos vectoriales, fórmulas matemáticas y vista previa con PDF.js.</li><li><strong>Excel:</strong> estilo fijo con color principal ajustable, política de fórmulas y valores en caché, inmovilización de paneles, filtros y celdas combinadas, con gráficos nativos y vista previa de hojas (incluidos los botones de filtro).</li><li><strong>Menú «Diseño»:</strong> el botón «Diseño» del cuadro de entrada se divide en dos páginas, Presentaciones y Word / PDF, y añade «Modo: Estándar / Avanzado». Las conversaciones nuevas usan Avanzado por defecto, y el valor predeterminado puede cambiarse en Configuración.</li><li><strong>Revisión visual automática:</strong> cuando un modelo con capacidad de visión termina de escribir una presentación, el programa convierte cada página en una imagen y se la entrega al modelo para una ronda de revisión; si se detectan problemas, se añade una respuesta con el archivo corregido; cada archivo se revisa una sola vez y puede desactivarse en Configuración. El progreso de la revisión se muestra en una línea debajo del mensaje, que puede desplegarse para ver cada paso y también detenerse.</li><li><strong>Modo Avanzado (Python):</strong> el modelo puede ejecutar en el navegador, en un entorno aislado (run.noureon.com), Python 3.14 con paquetes como numpy, pandas, matplotlib, python-docx, python-pptx, openpyxl y reportlab, para analizar archivos subidos, calcular gráficos con precisión y crear archivos. La primera vez se requiere una descarga de unos 30 MB. Se admiten las llamadas a herramientas de Gemini y OpenRouter; si el modelo no las admite, el navegador no es compatible o se usa el consejo de modelos o el modo de aprendizaje, se pasa automáticamente al modo Estándar y se explica el motivo.</li><li><strong>Archivos de creación libre:</strong> el modo Avanzado deja por defecto que el modelo diseñe por sí mismo los archivos de Word, PowerPoint y PDF; si se ha elegido una plantilla de diseño, ese tipo de archivos se entrega al sistema de diseño. El entorno aislado incluye las fuentes Inter, Source Han Sans y Source Han Serif (chino tradicional y simplificado, japonés y coreano), y las fuentes utilizadas se incrustan automáticamente en los archivos de Word y PowerPoint al terminar la respuesta. Los archivos solo se generan cuando el usuario los solicita o los proporciona; la escritura general y las preguntas y respuestas se responden con texto.</li><li><strong>Guardado y vista previa de archivos:</strong> los archivos generados por Python se guardan en el mensaje, y se sincronizan, exportan y comparten con la conversación; se ofrecen lectores propios de xlsx y pptx para previsualizar los archivos de diseño libre, y otros archivos como imágenes y ZIP también pueden previsualizarse o descargarse. Cuando falta un archivo en el dispositivo, puede restaurarse con «Volver a ejecutar». Las presentaciones de diseño libre también pasan por la revisión visual y, cuando se detectan problemas, el modelo vuelve a ejecutar Python para generar una versión corregida.</li><li><strong>Visualización del proceso de ejecución:</strong> desde el inicio de la respuesta se muestra en el mensaje la lista de pasos: razonamiento, preparación de Python, el código de cada ejecución, la salida en tiempo real y los archivos generados (las imágenes se muestran como miniaturas); los pasos en ejecución muestran un cronómetro y los fallidos conservan el error. Los pasos completados se pliegan en una línea; el despliegue y el plegado tienen una breve animación de transición y respetan el ajuste del sistema «Reducir movimiento».</li><li><strong>Visualización del razonamiento:</strong> en cualquier conversación, siempre que el modelo envíe razonamiento, encima de la respuesta se muestra un razonamiento desplegable que, al terminar, se conserva como «Razonamiento» o «Resumen del razonamiento» y puede consultarse tras recargar. El propio razonamiento del modelo se marca como «Razonamiento» y los modelos cuyo proveedor solo ofrece resúmenes (como Gemini y Claude) se marcan como «Resumen del razonamiento». Al leer razonamientos anteriores no se fuerza el desplazamiento al contenido más reciente; si se detiene antes de que aparezca la respuesta, se conserva como «Razonamiento interrumpido» junto con el contenido ya generado. Las solicitudes a los modelos de NVIDIA añaden el parámetro de transmisión del razonamiento.</li></ul>",
    "<strong>Otras mejoras</strong>",
    "<ul><li>Cuando la página ya estaba abierta antes de desplegarse la nueva versión y falla la carga de archivos nuevos, ahora se muestra «Noureon se acaba de actualizar a una nueva versión» con la opción de recargar, en lugar del error original del navegador, y no se vuelve a recargar repetidamente en un minuto.</li><li>Al pulsar Detener se conserva la respuesta parcial ya recibida; al cambiar de conversación se conserva la respuesta en curso.</li><li>El código de los mensajes del chat y de la vista del código fuente de los archivos se colorea según el lenguaje; se actualizan los catálogos de modelos de NVIDIA y OpenRouter; DOMPurify se actualiza a la versión 3.4.13.</li></ul>",
    "<strong>Limitaciones conocidas</strong>",
    "<ul><li>La visualización del razonamiento depende del proveedor: Gemini y Claude solo ofrecen resúmenes y la serie OpenAI no ofrece el texto del razonamiento, por lo que en esos casos se muestra el resumen o no se muestra nada.</li><li>La vista previa de PowerPoint de diseño libre se dibuja de forma aproximada con un lector propio; los rellenos con degradado de las formas, las sombras y algunos detalles de los gráficos difieren de los de PowerPoint, y el archivo descargado es el que prevalece.</li><li>Los modelos de NVIDIA no admiten por ahora las llamadas a herramientas y no usarán el modo Avanzado.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. Las conversaciones que incluyen registros de ejecución o archivos se sincronizan con otros dispositivos; los dispositivos que aún no se han actualizado a esta versión mostrarán el registro de ejecución como un fragmento de texto sin formato y no podrán ver los archivos generados por Python, por lo que conviene actualizarlos antes. Las conversaciones, la memoria y los datos sincronizados existentes no se ven afectados."
  ],
  "16.9.1": [
    "<strong>Notas de la versión de Noureon 16.9.1</strong>",
    "Esta versión mejora la operación de guardado de los chats temporales en la versión de escritorio, evitando que el índice de mensajes del lateral derecho interfiera con el botón de marcador.",
    "<strong>Correcciones</strong>",
    "<ul><li><strong>Operación de guardado:</strong> la zona del estado del chat temporal y del botón de marcador, en la esquina superior derecha, ya no activa el índice de mensajes, por lo que el chat temporal puede guardarse de forma permanente con fiabilidad.</li><li><strong>Índice de mensajes:</strong> en la versión de escritorio, el área de activación al pasar el cursor por el borde derecho comienza ahora debajo de la barra superior; la forma de abrirlo no cambia.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. Los chats normales, los chats temporales y los datos de memoria existentes no se ven afectados."
  ],
  "16.9.0": [
    "<strong>Notas de la versión de Noureon 16.9.0</strong>",
    "Esta versión añade el modo de chat temporal, que puede convertirse en chat normal en cualquier momento, y ofrece una elección clara sobre el uso de la memoria, así como límites de privacidad definidos.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Chat temporal:</strong> puede abrirse desde la esquina inferior izquierda de la interfaz de chat. El contenido temporal no aparece en el historial de chats, la búsqueda, la exportación ni la sincronización en la nube, y tampoco genera nuevos recuerdos.</li><li><strong>Control de personalización:</strong> antes de comenzar, puede elegirse entre consultar los recuerdos existentes o usar un modo sin personalizar, que ignora la memoria, los complementos y las instrucciones personalizadas.</li><li><strong>Guardado permanente:</strong> una vez iniciado el chat, puede guardarse de forma permanente desde la esquina inferior izquierda; en ese mismo lugar pasa a ser un chat normal. El contenido anterior al guardado no se incorpora retroactivamente a la memoria.</li><li><strong>Estado de la interfaz:</strong> el modo temporal muestra su estado en la esquina superior derecha, el aviso central ocupa la posición del saludo y los controles de la esquina inferior izquierda ya no se desplazan ni tapan el contenido principal.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. Los chats normales, la memoria y los datos de sincronización existentes no se ven afectados."
  ],
  "16.8.0": [
    "<strong>Notas de la versión de Noureon 16.8.0</strong>",
    "Esta versión rediseña el campo de entrada de la versión de escritorio y su interacción con las funciones adicionales, y corrige la estabilidad del diseño del menú de funciones adicionales en la versión móvil.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Campo de entrada:</strong> se han reajustado el ancho, el espaciado, las esquinas redondeadas, la sombra y la línea fina del borde superior en la versión de escritorio. El texto largo se extiende hacia abajo y, a partir de diez líneas, se ofrece un control para expandir; los archivos adjuntos y las etiquetas de función ya no deforman el campo de entrada.</li><li><strong>Funciones adicionales:</strong> Cámara, Imagen, Archivo, búsqueda web, Model Council y modo de aprendizaje usan ahora seis iconos PNG originales. El menú de escritorio resalta el elemento seleccionado y, al desplegarse, oculta el botón de la parte inferior; el menú móvil también mantiene una disposición compacta.</li><li><strong>Funciones en línea:</strong> las etiquetas de función compatibles pueden insertarse en cualquier línea y posición del cursor, y pueden seleccionarse, copiarse y eliminarse con la tecla de retroceso como si fueran texto. Tras el envío, quedan a la misma altura horizontal que el texto del mensaje.</li><li><strong>Estabilidad:</strong> se corrigen los problemas por los que las funciones adicionales no podían volver a activarse tras enviar un mensaje y por los que seleccionar de nuevo el mismo archivo adjunto no surtía efecto.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta actualización no requiere migración de datos. Los chats, los archivos adjuntos y la configuración de modelos existentes no se ven afectados."
  ],
  "16.7.1": [
    "<strong>Notas de la versión de Noureon 16.7.1</strong>",
    "Esta versión sincroniza las listas de modelos más recientes de Gemini, OpenRouter y NVIDIA, así como sus precios y capacidades multimodales.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Actualización de modelos:</strong> Gemini pasa a 3.8 Flash; Claude Fable pasa a 5.1; OpenAI GPT-5.5 pasa a GPT-6 Astra.</li><li><strong>Nuevos modelos:</strong> OpenRouter incorpora Z.ai GLM 5.3 Flash; NVIDIA pasa a DeepSeek V4 Pro 0813 y Kimi K3.</li><li><strong>Capacidades y precios:</strong> se actualizan los niveles de pensamiento, la capacidad de entrada de imágenes y los precios según los datos oficiales, y la descripción de DeepSeek se unifica con un precio conciso de entrada/salida.</li><li><strong>Simplificación de modelos:</strong> se elimina Ox Alpha; las selecciones de modelo existentes retroceden de forma segura mediante el mecanismo de migración de la configuración.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Los ajustes existentes de Gemini 3.7 Flash, Claude Fable 5, GPT-5.5 y de los modelos NVIDIA anteriores se migran automáticamente a los nuevos modelos correspondientes."
  ],
  "16.7.0": [
    "<strong>Notas de la versión de Noureon 16.7.0</strong>",
    "Esta versión ajusta la presentación en streaming y la estabilidad del diseño del contenido del chat, y corrige varios problemas relacionados con las fórmulas matemáticas, los gráficos, las tablas y las acciones sobre los mensajes.",
    "<strong>Cambios principales</strong>",
    "<ul><li><strong>Fórmulas matemáticas:</strong> se corrigen el análisis de comandos KaTeX en el entorno de producción, los delimitadores en línea y la división entre líneas de los delimitadores extensibles por pares. Las fórmulas se siguen renderizando en tiempo real conforme llega el contenido en streaming, y mejoran el salto de línea y el desplazamiento horizontal local de las fórmulas largas.</li><li><strong>Gráficos y tablas:</strong> mientras se genera un gráfico ya no se muestra el código original, sino un aviso de estado localizado, y el gráfico se muestra en cuanto los datos están lo bastante completos para renderizarse. Durante la generación de una tabla se evita su reconstrucción repetida, que provocaba parpadeos; al terminar se conservan el DOM y el estado de desplazamiento existentes.</li><li><strong>Diseño del chat:</strong> se ajustan el espaciado vertical entre los mensajes del usuario y las respuestas del asistente, el ritmo de los títulos y el uso de líneas separadoras, para reducir cortes visuales innecesarios.</li><li><strong>Acciones sobre mensajes y contenido multimedia:</strong> se corrigen el problema por el que, en la versión de escritorio, los botones de copiar y editar de los mensajes del usuario se ocultaban antes de tiempo al pasar el ratón, y el de las imágenes individuales de la versión móvil, que no se alineaban a la derecha.</li></ul>",
    "<strong>Compatibilidad</strong>",
    "Esta versión no modifica los datos de chat existentes, los datos de cuenta ni el formato de sincronización."
  ],
  "16.6.7": [
    "<strong>🚀 Noureon 16.6.7: vista previa de vídeo y actualización de modelos NVIDIA</strong>",
    "Esta actualización corrige las miniaturas de vídeo en blanco y el color del botón de cierre de los elementos multimedia, y sincroniza el modelo DeepSeek más reciente de NVIDIA.",
    "<strong>✨ Contenido de la actualización:</strong>",
    "<ul><li><strong>🎬 Miniaturas de vídeo:</strong> el módulo de vídeo, tanto en el campo de entrada como tras el envío, captura un fotograma visible como miniatura y usa un fondo oscuro durante la carga.</li><li><strong>✕ Controles multimedia:</strong> la cruz de quitar y cerrar en las vistas previas de imágenes y vídeos se muestra siempre en blanco.</li><li><strong>🧠 Modelos NVIDIA:</strong> DeepSeek V4 Flash pasa a DeepSeek V4 Flash 0731, que admite tres niveles de pensamiento (desactivado, alto y máximo), y la configuración de modelo existente se migra automáticamente.</li></ul>",
    "Noureon seguirá mejorando la experiencia multimedia y la compatibilidad con modelos."
  ],
  "16.6.6": [
    "<strong>🚀 Noureon 16.6.6: nuevos modelos de razonamiento visual y de prueba Stealth</strong>",
    "Esta actualización incorpora los modelos más recientes de OpenRouter y añade una confirmación de condiciones en el primer uso de los modelos Stealth de terceros.",
    "<strong>✨ Contenido de la actualización:</strong>",
    "<ul><li><strong>🧠 Nuevos modelos:</strong> se añaden Ox Alpha, una versión de prueba gratuita, y DeepSeek V4 Flash Vision Exp, que admite entrada de imágenes.</li><li><strong>🔐 Confirmación del primer uso:</strong> la primera vez que se selecciona Ox Alpha se muestran los Stealth Model Terms; tras la confirmación se guarda el estado y no se vuelve a mostrar el aviso.</li><li><strong>🌍 Idiomas y datos de capacidades:</strong> se sincronizan en las cinco interfaces el aviso de condiciones, los niveles de pensamiento, la capacidad de entrada de imágenes y los precios más recientes.</li></ul>",
    "Noureon seguirá actualizando la compatibilidad con modelos y las medidas de protección del usuario."
  ],
  "16.6.5": [
    "<strong>【Noureon 16.6.5: actualización de la lista de modelos y de la compatibilidad con proveedores】</strong>",
    "Esta actualización renueva las versiones de los modelos, las indicaciones de capacidades y los precios según los datos más recientes de la API de Google Gemini y de OpenRouter, y simplifica la integración de proveedores.",
    "<strong>✨ Aspectos destacados:</strong>",
    "<ul><li><strong>⚡ Nueva generación de modelos:</strong> Gemini pasa a 3.7 Flash; OpenRouter actualiza DeepSeek, Qwen y Grok, y añade las versiones gratuitas de GLM 5.3 y Nemotron 3.5 Lightning.</li><li><strong>🧠 Datos de capacidades sincronizados:</strong> se actualizan, según los datos de los proveedores, los niveles de pensamiento seleccionables, la compatibilidad con entrada de imágenes, los precios de los modelos y el orden por fecha de publicación.</li><li><strong>🧹 Simplificación de proveedores:</strong> la lista de NVIDIA conserva únicamente los modelos de DeepSeek, MoonshotAI, Step y Z.ai; se eliminan los modelos de Xiaomi y la integración del proveedor nativo Step Plan.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.6.4": [
    "<strong>【Noureon 16.6.4: operación de búsqueda móvil más estable】</strong>",
    "Esta versión de corrección sigue mejorando la búsqueda de chats en la versión móvil, de modo que la pantalla sea más estable y limpia al abrir y cerrar el teclado en pantalla.",
    "<strong>✨ Aspectos destacados de la corrección:</strong>",
    "<ul><li><strong>⌨️ Cambio de teclado más estable:</strong> se ajusta la forma de sincronizar el área visible del navegador móvil, lo que reduce los saltos de pantalla, los retrasos y la aparición momentánea del fondo del chat al abrir y cerrar el teclado.</li><li><strong>📱 Los controles de búsqueda ya no quedan tapados:</strong> el campo de entrada y la selección de modo se disponen según el área visible, de modo que los resultados de búsqueda pueden consultarse con normalidad con el teclado abierto.</li><li><strong>✨ Pantalla en reposo más sencilla:</strong> se elimina la lupa central y el aviso “Buscar chats” de la página de búsqueda móvil, para evitar que estos elementos provoquen retrasos o saltos al cambiar el teclado.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.6.3": [
    "<strong>【Noureon 16.6.3: búsqueda de chats más intuitiva y estable】</strong>",
    "Esta versión de corrección reorganiza la experiencia de búsqueda de chats para que, tanto en escritorio como en móvil, sea más rápido encontrar el contenido necesario.",
    "<strong>✨ Aspectos destacados de la corrección:</strong>",
    "<ul><li><strong>🔎 Tres modos de búsqueda:</strong> se mantienen los tres modos (palabras clave del título, palabras clave del contenido y lenguaje natural), y el modo seleccionado en ese momento adopta los colores personalizados de la interfaz del usuario.</li><li><strong>💬 Resultados más claros:</strong> la búsqueda solo muestra los chats ya existentes en el historial, usa un icono de chat sencillo y uniforme, y elimina el resaltado amarillo, los niveles de relevancia y las acciones adicionales de vista previa.</li><li><strong>🖥️ Renovación de la versión de escritorio:</strong> adopta una ventana de búsqueda centrada y reorganiza el campo de entrada, el cambio de modo, la voz y los controles de cierre, reduciendo los espacios en blanco innecesarios.</li><li><strong>📱 Versión móvil más estable:</strong> pasa a una página de búsqueda blanca adecuada para el uso táctil y el teclado en pantalla, lo que mejora los parpadeos, los saltos, las obstrucciones y los resultados no visibles al escribir.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.6.2": [
    "<strong>【Noureon 16.6.2: límites de seguridad y alcance de Nouras más claros】</strong>",
    "Esta versión de corrección mantiene límites de responsabilidad más claros para Nouras en el chat y evita que las instrucciones personalizadas afecten al procesamiento en segundo plano.",
    "<strong>✨ Aspectos destacados de la corrección:</strong>",
    "<ul><li><strong>🛡️ Aviso al crear Nouras de alto riesgo:</strong> al crear o editar un Nouras personalizado que afecte a ámbitos profesionales de alto riesgo, como la medicina, la psicología, el derecho o la inversión, se muestra un aviso de que no ha sido validado por profesionales y no sustituye la ayuda de un profesional cualificado; el usuario sigue pudiendo decidir si continúa con la creación.</li><li><strong>💬 Separación entre el chat y las tareas en segundo plano:</strong> las instrucciones de Nouras solo se aplican a las respuestas visibles para el usuario y a las deliberaciones de Model Council; no intervienen en tareas en segundo plano como la búsqueda, la traducción de archivos adjuntos o la organización de la memoria, lo que reduce los efectos de personalización no deseados.</li><li><strong>🤝 Nouras de salud mental más seguros:</strong> “Viaje interior” y “Guía consciente” quedan definidos explícitamente como ayuda para organizar información y reflexiones; no ofrecen diagnósticos, tratamientos, indicaciones médicas ni ajustes de medicación. Ante un peligro inminente, se prioriza animar a contactar con recursos de emergencia locales o con una persona de confianza.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.6.1": [
    "<strong>【Noureon 16.6.1: reparación automática del índice entre chats más completa】</strong>",
    "Esta versión de corrección completa la reparación automática del índice de contenido multimedia y hace que el progreso de la indexación en segundo plano sea más fácil de entender.",
    "<strong>✨ Aspectos destacados de la corrección:</strong>",
    "<ul><li><strong>🖼️ Completado automático del índice multimedia:</strong> cuando falta el índice local de imágenes, audios, vídeos o documentos existentes, la comprobación en segundo plano lo recupera directamente a partir de los resúmenes multimedia y los archivos adjuntos guardados, sin necesidad de comprobar y pulsar Optimizar manualmente de antemano.</li><li><strong>🔎 Progreso de la indexación más claro:</strong> el procesamiento en segundo plano se muestra ahora como “Consultar índice local” y distingue entre las cantidades reparadas, las ya existentes y las fallidas, de modo que el análisis por tramos ya no parece reconstruir todo el índice cada vez.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.6.0": [
    "<strong>【Noureon 16.6.0: búsqueda automática, memoria viva y un repaso entre chats más fiable】</strong>",
    "Esta versión hace que la búsqueda en internet sea más predecible y que la memoria entre chats sea más transparente y estable; la PWA instalada ahora puede girar con naturalidad junto con el dispositivo.",
    "<strong>✨ Aspectos destacados:</strong>",
    "<ul><li><strong>🌐 Búsqueda automática en internet más controlable:</strong> la búsqueda solo se activa automáticamente en la consulta concreta que requiere información externa reciente; la activación manual sigue aplicándose al chat actual y no se altera por la decisión automática.</li><li><strong>🧠 Memoria más viva y transparente:</strong> se añade un resumen de memoria sincronizable. Cuando una respuesta consulta chats anteriores, muestra las fuentes en un panel desplegable y permite volver al chat original para comprobar el contenido. Si se solicita con precisión una respuesta de una versión anterior, el sistema prioriza recuperar el contenido original y los detalles clave.</li><li><strong>🛡️ Recuerdo local más fiable:</strong> se corrige el problema por el que el índice del historial podía perderse o quedar obsoleto al recargar, sincronizar o mover a la papelera, y se añaden mecanismos de recuperación segura y de protección del último índice válido.</li><li><strong>📱 Giro libre de la PWA:</strong> Noureon instalada puede alternar con naturalidad entre vertical y horizontal en teléfonos y tabletas, manteniendo el estado del chat y de las operaciones principales.</li><li><strong>✨ Chat más estable:</strong> se corrige el parpadeo de toda la página al completarse la respuesta del modelo y mejora la presentación al cambiar de modelo y al citar respuestas anteriores.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.5.0": [
    "<strong>【Noureon 16.5.0: espacio de trabajo más fiable, memoria más inteligente y herramientas de creación más completas】</strong>",
    "Esta versión oficial integra las recientes mejoras de capacidades principales: el espacio de trabajo en la nube adopta un proceso de sincronización más seguro y recuperable; el sistema de memoria ofrece una gestión más clara y el consentimiento del recuerdo entre chats; y también se amplían las funciones de creación, de imágenes y de presentación de datos.",
    "<strong>✨ Aspectos destacados:</strong>",
    "<ul><li><strong>☁️ Sincronización en la nube más segura:</strong> se añaden actualizaciones del espacio de trabajo en tiempo real, sincronización incremental, carga de recursos bajo demanda, copias de seguridad de recuperación y mecanismos de eliminación segura, lo que reduce los conflictos de sincronización entre dispositivos y el riesgo de pérdidas accidentales.</li><li><strong>🧠 Memoria y recuerdo mejorados:</strong> se refuerzan la revisión de la memoria personal, la gestión de conflictos, los resúmenes por tema, la memoria multimedia y el índice local del historial; el recuerdo de conversación cruzada pasa a consentirse por separado en cada dispositivo.</li><li><strong>🎨 Creación de imágenes y contenido:</strong> se añade la generación de imágenes con OpenRouter y Step Plan, la continuación de modificaciones sobre la última imagen generada, la edición de zonas concretas y gráficos interactivos en los mensajes.</li><li><strong>💬 Mayor eficiencia en el chat:</strong> se admite la edición de mensajes ya enviados, las preguntas de seguimiento con citas, y las reglas de combinación del modo de aprendizaje con Noura; además mejora la fluidez de respuesta de Model Council y de la interfaz de chat.</li><li><strong>🔐 Privacidad y protección de la cuenta:</strong> se añaden un proceso seguro de recuperación de contraseña, el enmascaramiento de las claves API y la separación de los ajustes sensibles, y la información sensible se protege mejor al exportar los datos.</li><li><strong>🌍 Actualización de la interfaz y de los modelos:</strong> se amplía la interfaz en ruso y español, la personalización de carpetas, el orden de los modelos y la lista de modelos seleccionables; asimismo se actualizan varios modelos y la experiencia de uso en dispositivos móviles.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.4.5": [
    "<strong>【Gemini 3.0 Flash disponible y ajuste de la lista de modelos】</strong>",
    "Esta actualización añade Google Gemini 3.0 Flash Preview y reorganiza la lista de modelos: se retiran los modelos anteriores de la serie Gemini 2.5 y se incorporan varios modelos de buena relación calidad-precio.",
    "<strong>✨ Aspectos destacados:</strong>",
    "<ul><li><strong>⚡ Actualización de Gemini:</strong> se añade <strong>Gemini 3.0 Flash Preview</strong> (compatible con Google nativo y OpenRouter), con soporte de entrada de imágenes. Se retiran al mismo tiempo los modelos anteriores Gemini 2.5 Pro, Flash y Flash-Lite.</li><li><strong>🌟 Nuevos modelos:</strong> se añaden de OpenRouter <strong>Xiaomi Mimo V2 Flash</strong> (gratuito) y <strong>Minimax M2.1</strong>.</li><li><strong>💻 Actualización de modelos de código:</strong> se añade <strong>OpenAI GPT-5.2 Codex</strong> (con soporte de entrada de imágenes), que sustituye a GPT-5.1 Codex.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.4.4": [
    "<strong>【Nueva serie GPT-5.2 y ajuste de la lista de modelos】</strong>",
    "Esta actualización añade la serie OpenAI GPT-5.2, elimina versiones anteriores y ajusta las tarifas de la serie Qwen.",
    "<strong>✨ Aspectos destacados:</strong>",
    "<ul><li><strong>🚀 Actualización de modelos:</strong> se añaden <strong>OpenAI GPT-5.2</strong> y <strong>GPT-5.2 Pro</strong>. Se retiran al mismo tiempo los modelos anteriores GPT-5.1, GPT-4.1 y Grok 4 Fast.</li><li><strong>⚖️ Ajuste de tarifas:</strong> se han actualizado las tarifas de <strong>Qwen 3 Next 80B</strong> y <strong>Qwen 3 Coder Exact</strong>; consulte la lista de modelos para ver los precios más recientes.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.4.3": [
    "<strong>【Nuevo modelo gratuito de programación y ajuste de la tarifa de Grok】</strong>",
    "Esta actualización añade el modelo gratuito de programación Mistral Devstral 2512 y establece la tarifa oficial de Grok 4.1 Fast.",
    "<strong>✨ Aspectos destacados:</strong>",
    "<ul><li><strong>💻 Modelo gratuito de programación:</strong> se añade <strong>Mistral Devstral 2512</strong>, orientado a la generación de código y a las consultas técnicas, de uso gratuito.</li><li><strong>💰 Actualización de tarifas:</strong> <strong>Grok 4.1 Fast</strong> finaliza su gratuidad por tiempo limitado y pasa a la tarifa oficial (entrada $0.20 / salida $0.50); además se elimina el canal gratuito anterior para garantizar la estabilidad del servicio.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.4.2": [
    "<strong>【Nuevo modelo gratuito de visión】</strong>",
    "Esta actualización añade Amazon Nova 2 Lite y DeepSeek V3.2.",
    "<strong>✨ Aspectos destacados:</strong>",
    "<ul><li><strong>👁️ Modelo gratuito de visión:</strong> se añade <strong>Amazon Nova 2 Lite</strong>, con soporte de entrada de imágenes y de uso gratuito.</li><li><strong>🧠 Modelo de texto:</strong> se añade <strong>DeepSeek V3.2</strong>, de tarifa más baja y con capacidad de razonamiento.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.4.1": [
    "<strong>【Reorganización de la base de datos de modelos: nuevos modelos de visión y de código】</strong>",
    "La versión 16.4.1 reorganiza la base de datos de modelos, añade modelos de desarrollo de software y de reconocimiento visual avanzado, ajusta los precios de algunos modelos y elimina opciones obsoletas.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>🚀 Nuevos modelos:</strong> se añaden <strong>OpenAI GPT-5.1 Codex</strong> y <strong>Claude 4.5 Opus</strong>, ambos con soporte de entrada de imágenes; también se añaden <strong>Qwen3 Next 80B</strong> y <strong>Qwen3 VL 30B</strong>.</li><li><strong>💰 Ajuste de precios:</strong> la tarifa de uso de <strong>Qwen3 235B</strong> se reduce (hasta $0.07/$0.46) y se añade el modelo gratuito <strong>TNG R1T Chimera</strong>.</li><li><strong>🧹 Reorganización de la lista:</strong> se eliminan los modelos anteriores y duplicados (como GPT-oss, la serie Nano y el Qwen VL anterior) y se actualiza la información de precios de Gemini 2.5 Flash Lite Preview.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.4.0": [
    "<strong>【Sincronización P2P entre dispositivos】</strong>",
    "La versión 16.4.0 añade la función “Sincronización P2P entre dispositivos”, que permite transferir datos entre dispositivos sin registrar una cuenta y sin almacenarlos en servidores en la nube.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>📲 Sincronización P2P entre dispositivos (Peer-to-Peer Sync):</strong> utiliza la tecnología WebRTC para conectar directamente los dispositivos. El dispositivo antiguo genera un código QR y el nuevo lo escanea con la cámara, tras lo cual se sincronizan el historial de chats, los ajustes y los Nouras.</li><li><strong>🔒 Protección de la privacidad:</strong> el historial de chat se transmite directamente por un canal cifrado durante todo el proceso, sin almacenarse en ningún servidor de terceros.</li><li><strong>⚡ Forma de uso:</strong> se encuentra en “Configuración > Gestión de datos”; no requiere el proceso de exportar e importar copias de seguridad y permite transferir datos entre plataformas (móvil/ordenador).</li></ul>",
    "El equipo de Noureon"
  ],
  "16.3.0": [
    "<strong>【Ajuste de la interfaz a pantalla completa】</strong>",
    "La versión 16.3.0 ajusta la interfaz de las ventanas de las funciones principales para mejorar la experiencia de uso en dispositivos móviles.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>📱 Modo de pantalla completa (Full Screen Mode):</strong> la “página de configuración”, la “búsqueda de mensajes del historial” y el “panel de datos personales” se presentan ahora a pantalla completa.<ul><li><strong>Área de visualización ampliada:</strong> se eliminan los márgenes de la ventana y el límite de ancho máximo, y el contenido ocupa toda la pantalla; al consultar gráficos de datos o ajustar varias opciones se puede mostrar más información y se reduce el desplazamiento.</li><li><strong>Experiencia en dispositivos móviles:</strong> mejora el uso en la versión móvil, ya que sustituye a la ventana flotante anterior y ofrece una experiencia cercana a la de una aplicación nativa.</li></ul></li><li><strong>🎨 Diseño visual:</strong> acorde con el diseño a pantalla completa, se eliminan las esquinas redondeadas (Rounded Borders) de la ventana y el espacio exterior.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.2.0": [
    "<strong>【Compresión de copias de seguridad y optimización del rendimiento】</strong>",
    "La versión 16.2.0 añade un mecanismo de compresión de copias de seguridad y corrige problemas de la interfaz.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>📦 Compresión de copias de seguridad (soporte ZIP):</strong> al exportar los datos, el sistema los empaqueta automáticamente en formato <code>.zip</code>.<ul><li><strong>Compresión de imágenes:</strong> las imágenes demasiado grandes se ajustan automáticamente a 1920px y se convierten a formato JPEG, lo que reduce el tamaño del archivo (hasta un 90%) conservando la nitidez visual.</li><li><strong>Estructura de archivos:</strong> las imágenes y los demás archivos adjuntos (como PDF o TXT) se almacenan por separado en las carpetas <code>images/</code> y <code>files/</code>.</li></ul></li><li><strong>🔄 Compatibilidad con versiones anteriores:</strong> la función de importación reconoce las nuevas copias de seguridad <code>.zip</code> y admite los archivos <code>.json</code> de versiones anteriores exportados en el pasado.</li><li><strong>🛠️ Corrección de la interfaz:</strong> se corrige el problema por el que, tras importar registros directamente desde la página de inicio de sesión, la pantalla de inicio de sesión anterior podía permanecer y bloquear el desplazamiento o los toques.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.1.1": [
    "<strong>【Nuevos modelos de visión y categoría de generación de imágenes】</strong>",
    "La versión 16.1.1 añade modelos gratuitos con capacidad de visión y adelanta la interfaz de la categoría de generación de imágenes.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>🚀 Modelo gratuito de visión de Grok:</strong> se añade <code>x-ai/grok-4.1-fast:free</code>, con soporte de entrada de imágenes y de uso gratuito.</li><li><strong>🍌 Categoría de generación de imágenes:</strong> se añade la categoría “Generación de imágenes” y se incorporan de antemano dos opciones de modelo, <strong>Nano banana pro🍌</strong> y <strong>Nano banana🍌</strong>.</li><li><strong>🚧 Notas:</strong> por ahora, los modelos de la serie Nano banana solo ofrecen la <strong>opción en la interfaz</strong>; la función de generación de imágenes aún no está disponible, por lo que al seleccionar estos modelos todavía no se pueden producir imágenes. Estará disponible en versiones posteriores.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.1.0": [
    "<strong>【Experiencia en dispositivos móviles y ajustes visuales】</strong>",
    "La versión 16.1.0 ajusta la experiencia en dispositivos móviles y detalles de la interfaz para garantizar la coherencia de las funciones entre plataformas.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>📱 Corrección de la subida de archivos de OpenRouter en móvil:</strong> se corrige la lógica de filtrado del menú inferior de la versión móvil. Al usar modelos de OpenRouter (como Claude o GPT-4), el menú desplegable del móvil muestra correctamente el botón “📁 Archivo”.</li><li><strong>👀 Nombres de archivo abreviados:</strong> los nombres de archivo demasiado largos se muestran truncados visualmente en las burbujas de chat (primeros cinco caracteres + ...). Se trata de un ajuste de visualización; el modelo de IA sigue recibiendo el nombre de archivo completo.</li><li><strong>⚡ Estabilidad:</strong> se optimiza la determinación del estado de los botones al cambiar entre Gemini y OpenRouter.</li></ul>",
    "El equipo de Noureon"
  ],
  "16.0.0": [
    "<strong>【Compatibilidad de archivos con OpenRouter y mejora de la base técnica】</strong>",
    "La versión 16.0.0 permite que los modelos conectados a través de OpenRouter también lean archivos, de modo que pueden analizar informes en PDF e imágenes.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>📁 Compatibilidad de archivos con OpenRouter:</strong> se pueden subir documentos PDF o imágenes a los modelos compatibles de OpenRouter. El sistema integra un motor de análisis de archivos que permite a estos modelos leer y analizar el contenido de los documentos subidos, sin limitarse ya a los modelos Gemini.</li><li><strong>🔧 Compatibilidad con dos plataformas:</strong> para resolver las diferencias de formato de datos entre plataformas, se ha reestructurado la lógica subyacente de transmisión de archivos. El sistema ajusta el formato según el modelo de destino: a OpenRouter envía la información completa, incluido el nombre del archivo, para facilitar el análisis, y a Gemini le organiza automáticamente el formato de los datos, lo que resuelve los errores de transmisión entre ambas plataformas.</li><li><strong>🎨 Interfaz adaptada al modelo:</strong> el menú de adjuntos muestra u oculta automáticamente los botones de subida correspondientes según las capacidades del modelo seleccionado (si admite visión y si admite documentos).</li></ul>",
    "Esta actualización amplía el alcance del procesamiento de archivos de Noureon, que ya no está limitado a un único proveedor de modelos.<br><br>El equipo de Noureon"
  ],
  "15.10.3": [
    "<strong>【Tablas inteligentes y actualización de modelos】</strong>",
    "La versión 15.10.3 mejora la lectura de tablas en dispositivos móviles y actualiza las opciones de modelos.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>📊 Desplazamiento de tablas:</strong> cuando la IA genera una tabla ancha, se crea automáticamente una barra de desplazamiento horizontal interna; el ancho de la burbuja de chat no cambia y la tabla completa puede consultarse deslizando a izquierda y derecha dentro de la burbuja, sin que el diseño se deforme.</li><li><strong>👆 Prevención de toques accidentales en el móvil:</strong> al deslizar para consultar una tabla, el gesto que abre la barra lateral se desactiva temporalmente para evitar abrirla por error.</li><li><strong>🤖 Ajuste de la biblioteca de modelos:</strong> se añade <strong>x-ai/grok-4.1-fast</strong> (con soporte de entrada de imágenes, gratuito por tiempo limitado) y se eliminan los modelos de prueba de la serie Sherlock.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.10.2": [
    "<strong>【Actualización de la personalización de carpetas】</strong>",
    "La versión 15.10.2 reestructura el sistema de personalización de carpetas y sustituye los emojis por iconos de líneas SVG.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>🎨 Iconos de líneas SVG:</strong> los iconos de emojis se sustituyen por iconos SVG de estilo minimalista (con formas como carpeta, nube y etiqueta).</li><li><strong>🖌️ Colores independientes:</strong> se pueden configurar por separado el “color de línea del icono” y el “color de la etiqueta de texto” (con tres colores: negro, blanco y gris).</li><li><strong>📱 Ajustes en la versión móvil:</strong> se rediseña el icono del menú de acciones de la versión móvil (un icono de control deslizante representa “Personalizar”) y se corrigen los problemas de diseño de la ventana de personalización y la superposición de iconos.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.10.1": [
    "<strong>【Actualización de la biblioteca de modelos: nuevos modelos experimentales y lista simplificada】</strong>",
    "La versión 15.10.1 añade dos modelos gratuitos de prueba proporcionados por OpenRouter y elimina algunos modelos.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>🚀 Nuevos modelos experimentales:</strong> se añaden dos modelos de prueba Alpha, actualmente gratuitos y ambos con soporte de entrada de imágenes:<ul style='margin-left: 20px; margin-top: 5px;'><li><strong>Sherlock Dash Alpha:</strong> diseñado para preguntas y respuestas rápidas y directas, y para la ejecución de tareas.</li><li><strong>Sherlock Think Alpha:</strong> diseñado para tareas complejas que requieren pensamiento profundo, razonamiento y planificación.</li></ul></li><li><strong>🧹 Simplificación de la lista de modelos:</strong> se elimina el modelo <strong>Minimax M2</strong>.</li></ul>",
    "Noureon seguirá evaluando y añadiendo modelos. Puede probar los modelos de prueba y enviar sus comentarios.<br><br>El equipo de Noureon"
  ],
  "15.10.0": [
    "<strong>【Noureon admite la instalación como PWA】</strong>",
    "La versión 15.10.0 convierte Noureon en una aplicación web progresiva (PWA), que ofrece una experiencia de uso más cercana a la de una aplicación nativa.",
    "<strong>✨ Aspectos destacados de esta actualización:</strong>",
    "<ul><li><strong>Instalación en el escritorio o la pantalla de inicio:</strong> Noureon puede instalarse en el escritorio del ordenador o en la pantalla de inicio del teléfono para iniciarse con un solo clic. Pulse el icono de instalación de la barra de direcciones del navegador.</li><li><strong>Acceso sin conexión:</strong> cuando la red es inestable o no hay conexión, la interfaz básica de la aplicación sigue pudiendo cargarse y es posible consultar los registros anteriores.</li><li><strong>Ventana independiente:</strong> al iniciarse desde el icono del escritorio, Noureon se ejecuta en una ventana independiente que oculta la barra de direcciones y los botones del navegador.</li><li><strong>Velocidad de carga:</strong> gracias a la tecnología de caché, el inicio y la carga son más rápidos tras la primera visita.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.9.1": [
    "<strong>【Actualización de la biblioteca de modelos y optimización del rendimiento】</strong>",
    "La versión 15.9.1 actualiza la biblioteca principal de modelos y ajusta la arquitectura subyacente:",
    "<strong>Actualización de modelos:</strong>",
    "<ul><li><strong>Nuevo modelo OpenAI GPT-5.1:</strong> se incorpora GPT-5.1 de OpenAI.</li><li><strong>Reorganización de la biblioteca de modelos:</strong> se elimina el modelo de prueba <code>Polaris Alpha</code> y el anterior <code>GPT-5</code>, sustituido por GPT-5.1.</li></ul>",
    "<strong>Estabilidad y optimización de la experiencia:</strong>",
    "<ul><li><strong>Ajuste de la arquitectura del backend:</strong> se ajustan los servicios del backend para admitir los nuevos modelos y mejorar el rendimiento general.</li><li><strong>Retoques de la interfaz:</strong> se corrigen problemas de visualización del estilo de algunas partes de la interfaz en determinadas circunstancias, mejorando la coherencia visual.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.9.0": [
    "<strong>【Simplificación del núcleo y optimización de la experiencia】</strong>",
    "La versión 15.9.0 ajusta las funciones principales y la interfaz:",
    "<ul><li><strong>Eliminación de la memoria entre chats (tipo 2):</strong> para que las respuestas de la IA sean más centradas y predecibles, se elimina la función de “memoria entre chats”. La memoria de la IA incluirá únicamente la <strong>“memoria de hábitos personales (tipo 1)”</strong> establecida explícitamente por el usuario y el contexto del chat actual. Este ajuste simplifica las opciones de configuración y hace que el comportamiento de la IA sea más estable y coherente.</li><li><strong>Corrección del diseño de la gestión de la memoria:</strong> se corrige el problema por el que, en “Configuración > Gestión de la memoria”, un contenido demasiado largo en una sola memoria personalizada ensanchaba la ventana de configuración y desordenaba el diseño. Ahora el texto se ajusta automáticamente en varias líneas.</li></ul>",
    "<strong>【Aclaración】</strong>",
    "Esta actualización se centra en el ajuste y la simplificación de las funciones principales, para que la gestión de la memoria sea más sencilla y fiable.",
    "El equipo de Noureon"
  ],
  "15.8.1": [
    "<strong>【Velocidad de salida y ajustes de la interfaz】</strong>",
    "La versión 15.8.1 mejora la velocidad de visualización de la salida de los mensajes y detalles de la interfaz:",
    "<ul><li><strong>Nuevo motor de salida en streaming:</strong> se reescribe la forma de mostrar los mensajes. La nueva tecnología de “renderizado sincronizado por fotogramas” refleja la velocidad de salida original del modelo y elimina el retraso de que “el modelo ya terminó de generar pero el texto sigue mostrándose carácter por carácter”. El retraso de alcance del renderizado de texto <strong>se reduce de una media de 2400 milisegundos a 140 milisegundos</strong>.</li><li><strong>Simplificación del flujo de operación:</strong> a raíz de los comentarios de los usuarios, se elimina el mecanismo de doble confirmación de “tocar dos veces para enviar”; cada toque envía el mensaje directamente.</li></ul>",
    "<strong>【Ajustes de la interfaz y corrección de animaciones】</strong>",
    "Los ajustes de detalle de la interfaz son los siguientes:",
    "<ul><li><strong>Animación adaptable del campo de entrada:</strong> se corrige el problema de la transición poco fluida de la animación cuando el campo de entrada cambia entre la forma “ovalada” y la de “rectángulo de esquinas redondeadas”.</li><li><strong>Corrección del diseño:</strong> se corrige el problema por el que las etiquetas de funciones adicionales o los botones sobresalían del borde del campo de entrada ovalado; ahora se adopta un diseño de esquinas redondeadas adaptable, de modo que todos los elementos quedan dentro del campo de entrada en cualquier estado.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.8.0": [
    "<strong>【Rediseño de la función de preguntas de seguimiento】</strong>",
    "La versión 15.8.0 rediseña la función de “preguntas de seguimiento”:",
    "<ul><li><strong>Panel flotante:</strong> las sugerencias de preguntas de seguimiento se muestran en un panel flotante en la parte superior de la pantalla. Basta con pulsar el botón de “bombilla de inspiración” de la esquina superior derecha para ver las sugerencias, sin necesidad de desplazarse para buscarlas.</li><li><strong>Dispositivos móviles:</strong> en el teléfono, las opciones de preguntas de seguimiento pasan al modo de “tarjetas deslizables”, que se exploran deslizando a izquierda y derecha, ahorran espacio en pantalla y resuelven el conflicto de gestos con la barra lateral.</li></ul>",
    "<strong>【Ajustes de la interfaz y correcciones de estabilidad】</strong>",
    "Los ajustes de la interfaz son los siguientes:",
    "<ul><li><strong>Vista del chat:</strong> se eliminan las líneas separadoras entre los bloques de la barra lateral, se reduce el espaciado y se estrecha la barra de título superior de la versión de escritorio, para reservar más espacio al chat.</li><li><strong>Estabilidad de la operación:</strong> se corrige el problema por el que el botón “Desplazarse al final” saltaba arriba y abajo en determinadas operaciones, y se elimina el botón “Nuevo chat” duplicado.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.7.12": [
    "<strong>【Optimización del proceso de inicio】</strong>",
    "Esta actualización optimiza el proceso de carga y mejora los problemas al iniciar y al recargar:",
    "<ul><li><strong>【Corrección de la experiencia】</strong> Tras recargar la página se mantiene la sesión iniciada, sin necesidad de volver a iniciar sesión.</li><li><strong>【Corrección visual】</strong> Se corrige el problema por el que, al iniciar o recargar, el modelo mostrado sobre el chat aparecía con retraso.</li><li><strong>【Corrección visual】</strong> Se corrige el problema por el que el color de los botones principales, como el de enviar, parpadeaba primero en el azul predeterminado durante la carga y solo después pasaba al color personalizado.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.7.11": [
    "<strong>【Actualización de la biblioteca de modelos】Nuevo modelo de prueba</strong>",
    "Esta actualización añade un modelo de prueba gratuito:",
    "<ul><li><strong>【Nuevo】</strong> Se añade el modelo <strong>Polaris Alpha (free)</strong> de OpenRouter, que puede seleccionarse en la categoría “Modelos Beta” del selector de modelos.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.7.10": [
    "<strong>【Actualización de la biblioteca de modelos】</strong>",
    "El contenido de esta actualización es el siguiente:",
    "<ul><li><strong>【Nuevo】</strong> Se añade el modelo <strong>Kimi K2 Thinking</strong> de Moonshot AI, adecuado para el análisis profundo y el razonamiento complejo.</li><li><strong>【Simplificación】</strong> Se eliminan <code>Deepseek V3.1 Chat</code>, <code>Qwen3 235B</code> y <code>Llama 3.3 70B Instruct</code>.</li></ul>",
    "El equipo de Noureon"
  ],
  "15.7.9": [
    "<strong>【Ampliación de la biblioteca de modelos】</strong>Se añaden dos modelos con soporte de entrada de imágenes:",
    "<ul><li><strong>Nuevo modelo gratuito de visión (NVIDIA Nemotron):</strong> se incorpora el modelo multimodal gratuito de NVIDIA, con soporte de comprensión y análisis de imágenes.</li><li><strong>Nuevo modelo de visión avanzado (Qwen 2.5 VL):</strong> se añade el modelo grande de visión y lenguaje de Qwen (Tongyi Qianwen), adecuado para situaciones que requieren un análisis profundo de imágenes.</li></ul>",
    "<strong>【Optimización de la biblioteca de modelos】</strong>Se elimina el modelo en fase de prueba <code>Andromeda Alpha</code>.",
    "El equipo de Noureon"
  ],
  "15.7.8": [
    "<strong>【Ajuste del diseño de la interfaz principal】</strong> El “selector de modelos” pasa de la esquina superior derecha a la parte superior del chat, en sustitución del título del chat. Cambiar de modelo resulta más directo y la vista del chat, más limpia.",
    "<strong>【Rediseño de la parte superior de la barra lateral】</strong> A partir de las sugerencias de los usuarios, se rediseña la parte superior de la barra lateral izquierda:",
    "<ul><li><strong>La búsqueda, primero:</strong> la función “Buscar” se presenta con un cuadro de búsqueda más ancho, que facilita localizar los chats del historial.</li><li><strong>Diseño equilibrado:</strong> “Nuevo chat” y “Seleccionar lote” pasan a ser botones de icono independientes.</li></ul>",
    "<strong>【Correcciones de detalles y de la experiencia】</strong>Se ajustan detalles de interacción de la interfaz:",
    "<ul><li><strong>Alineación de la posición:</strong> se corrige la posición de la ventana de selección de modelos, que ahora se despliega desde el texto del nombre del modelo en lugar de quedar pegada al borde de la pantalla.</li><li><strong>Corrección del desplazamiento:</strong> se corrige el problema por el que, al alternar entre listas largas y cortas, la ventana de selección de modelos podía no desplazarse o mostrar espacio en blanco sobrante.</li></ul>",
    "<strong>【Ajuste del espacio visual】</strong>Se aumenta ligeramente el ancho predeterminado de despliegue de las barras laterales izquierda y derecha, para facilitar la consulta de la lista de chats y del índice de mensajes.",
    "El equipo de Noureon"
  ],
  "15.7.7": [
    "<strong>【Ampliación de la biblioteca de modelos】Nuevos tres modelos de la serie Qwen3</strong> Ahora se pueden usar tres nuevos modelos Qwen a través de OpenRouter.",
    "<strong>【Capacidad de visión】Nuevo Qwen3 VL 8B Instruct:</strong> este modelo de visión ligero tiene capacidad de reconocimiento de imágenes y destaca entre los modelos de su categoría, con <strong>un rendimiento superior al de Gemini 2.5 Flash Lite y GPT-5 Nano</strong>.",
    "<strong>【Dos nuevos modelos de la versión 2507】</strong> <strong>`Qwen3 235B (2507)`</strong> y <strong>`Qwen3 235B Thinking (2507)`</strong>, optimizado para el pensamiento profundo, con un rendimiento <strong>muy superior</strong> al de la versión anterior.",
    "<strong>【Actualización y correcciones del backend】</strong>Los nuevos modelos anteriores se integran en el selector de modelos y se marca en el sistema la capacidad de visión de `Qwen3 VL 8B Instruct`. El número de versión se ha actualizado a 15.7.7.",
    "Noureon seguirá incorporando nuevos modelos y mejorando la experiencia de uso.<br><br>El equipo de Noureon"
  ],
  "15.7.6": [
    "<strong>【Compatibilidad multimodal】Noureon admite los modelos de visión de OpenRouter.</strong> Al seleccionar un modelo con función de visión, se pueden subir imágenes para que la IA comprenda su contenido y mantenga conversaciones con texto e imágenes.",
    "<strong>【Ampliación de la biblioteca de modelos】Nuevos dos modelos de visión Qwen (Tongyi Qianwen):</strong> se añaden <strong>`qwen3-vl-235b-instruct` (de pago)</strong> y <strong>`qwen2.5-vl-72b-instruct:free` (gratuito)</strong>.",
    "<strong>【Ajuste de la interfaz】Botones de función dinámicos:</strong> las opciones “Cámara” e “Imagen” del botón “+” junto al campo de entrada solo se muestran al seleccionar un modelo con función de visión.",
    "<strong>【Actualización y correcciones del backend】</strong>Se actualizó el número de versión de la aplicación a 15.7.6 y se añadieron al archivo de idiomas (`i18n.js`) los textos descriptivos de los nuevos modelos, para ofrecer información más completa."
  ],
  "15.7.5": [
    "<strong>【Actualización de la interfaz】Nuevo selector de modelos “por niveles”.</strong> Ante el crecimiento continuo de la biblioteca de modelos, se reestructura el proceso de selección de modelos. Se puede elegir sucesivamente “Proveedor” > “Tipo de coste” > “Empresa de IA” > “Uso del modelo”.",
    "<strong>【Ampliación de la biblioteca de modelos】Nuevos 12 modelos.</strong> Se amplía la compatibilidad con OpenRouter con 12 modelos de empresas como OpenAI, Anthropic, Deepseek y MoonshotAI, entre ellos la <strong>serie GPT-4.1</strong> y <strong>Claude 4.5 Sonnet</strong>.",
    "<strong>【Ajuste de la gestión】La función de ordenación de modelos de la página de configuración se sincroniza con el selector.</strong> La página de gestión de modelos de “Configuración” adopta la misma estructura de categorías, y se puede ordenar dentro de cada grupo de categoría.",
    "<strong>【Corrección】</strong>Se corrige el problema por el que, al pulsar “Volver” en el selector de modelos, la altura de la ventana no cambiaba y aparecía una barra de desplazamiento sobrante; y se corrige el error de versiones anteriores por el que no se podían seleccionar los modelos de OpenRouter al hacer clic."
  ],
  "15.7.4": [
    "<strong>【Actualización de la interfaz】Nuevo selector de modelos de varios niveles.</strong> Se reestructura el selector de modelos, que permite elegir sucesivamente “Proveedor” > “Tipo de coste” > “Empresa de IA”.",
    "<strong>【Ampliación de la biblioteca de modelos】Nuevos 9 modelos.</strong> Se añaden nueve modelos a OpenRouter, entre ellos <strong>la serie GPT-5 y GPT-4.1 Mini de OpenAI</strong>, <strong>los modelos Grok de x-ai</strong> y <strong>los modelos de Qwen especializados en código</strong>.",
    "<strong>【Actualización sincronizada】Interfaz de gestión de modelos.</strong> La página de gestión de modelos de “Configuración” se actualiza a la nueva estructura de categorías, y se puede ordenar los modelos dentro de su grupo de categoría.",
    "<strong>【Ajuste de nombres】</strong>Para normalizar los nombres de los modelos, se elimina el prefijo “Noureon-” de todos los nombres y se usan nombres genéricos (por ejemplo, Gemini 2.5 Pro).",
    "<strong>【Corrección】</strong>Se corrige el problema por el que la altura del selector de modelos no cambiaba tras pulsar “Volver”, y el de que, en determinados flujos, no se podían seleccionar los modelos de OpenRouter al hacer clic."
  ],
  "15.7.3": [
    "<strong>【Actualización del sistema backend】Mejora del canal de datos:</strong> se ha actualizado el sistema backend que procesa el “historial de chats”, los “comentarios” y las “propuestas de Noureon”, de modo que cada tipo de datos se recibe de forma más estable y fiable, sentando además las bases de las futuras funciones de personalización.",
    "<strong>【Registro de datos】Nuevo registro del “modelo utilizado”:</strong> en el nuevo canal de datos se añade el registro del “modelo utilizado”, con el fin de conocer el rendimiento de los distintos modelos en tareas concretas y mejorar continuamente el servicio de Noureon.",
    "<strong>Actualización del Centro de ayuda, las Condiciones de uso y la política de privacidad:</strong> se han actualizado el Centro de ayuda, las Condiciones de uso y la política de privacidad; consúltelos."
  ],
  "15.7.2": [
    "<strong>【Nueva función】Programa de mejora de Noureon:</strong> para seguir mejorando la calidad de las respuestas de Noureon, se establece un proceso de aprendizaje de la IA. Algunos datos de chat anónimos se utilizarán para analizar y optimizar los modelos de IA.",
    "<strong>Protección de la privacidad:</strong> todos los datos utilizados en este programa están protegidos, su único fin es entrenar a Noureon y no se usarán para ningún otro propósito ni se compartirán con terceros.",
    "<strong>【Corrección importante】</strong>Se corrige un problema ocasional: al abrir un chat nuevo, los datos de preguntas y respuestas de la primera ronda a veces no se incorporaban al proceso de aprendizaje del modelo de IA. La nueva versión garantiza que este proceso sea estable."
  ],
  "15.7.1": [
    "<strong>【Nueva función】Resaltado y sincronización del índice de mensajes.</strong> El índice de mensajes resalta automáticamente el mensaje que se está viendo en la pantalla principal.",
    "<strong>Ubicación en tiempo real:</strong> al desplazarse por un chat largo, el índice actualiza el elemento resaltado en tiempo real, lo que ayuda a saber en qué punto de la lectura se está.",
    "<strong>【Corrección importante】Corrección de la superposición de la interfaz:</strong> se corrige el error de visualización en dispositivos móviles por el que el mensaje de bienvenida inicial se superponía a la barra de funciones superior. El nuevo diseño dinámico es válido para pantallas de todos los tamaños.",
    "<strong>Optimización:</strong> mejora el rendimiento de renderizado al desplazar la página, para asegurar que la nueva función no afecte a la fluidez de la aplicación."
  ],
  "15.7.0": [
    "<strong>【Nueva función】Nueva barra lateral “Índice de mensajes”.</strong> En chats largos permite localizar rápidamente un mensaje concreto.",
    "<strong>Apertura deslizando:</strong> en la versión de escritorio, se abre moviendo el ratón al borde derecho de la pantalla; en la versión móvil, deslizando de derecha a izquierda.",
    "<strong>Salto rápido:</strong> al pulsar un mensaje del índice, se salta de inmediato a su posición en la pantalla principal, con un efecto de resaltado.",
    "<strong>Optimización:</strong> la animación de transición del proceso de inicio de sesión es más fluida y rápida, para ofrecer una mejor experiencia de arranque.",
    "<strong>Optimización:</strong> al eliminar el chat que se está viendo, el sistema abre ahora automáticamente un chat nuevo, lo que hace el flujo de operación más intuitivo.",
    "<strong>Corrección:</strong> se resuelve el problema por el que, en determinados dispositivos, podían producirse parpadeos de la pantalla o transiciones poco fluidas tras iniciar sesión."
  ],
  "15.6.1": [
    "<strong>Optimización:</strong> fluidez de la animación de plegado y despliegue dentro de la barra lateral",
    "<strong>Optimización:</strong> la subida de archivos y la de imágenes se integran en una sola subida",
    "<strong>Optimización:</strong> estilo de la interfaz desplegable del campo de entrada con el botón + de funciones adicionales",
    "<strong>Corrección:</strong> problema de transparencia excesiva del menú de modelos"
  ],
  "15.6.0": [
    "<strong>Optimización:</strong> nueva función de resaltado de la selección del historial de chats, para ver con más claridad el chat que se está utilizando",
    "<strong>Nuevo:</strong> más Nouras",
    "<strong>Corrección:</strong> problema por el que la búsqueda global encontraba registros de la papelera"
  ],
  "15.5.0": [
    "<strong>Actualización:</strong> nuevo estilo de la barra lateral"
  ],
  "15.4.9": [
    "<strong>Corrección:</strong> se corrige el problema por el que la pantalla de carga permitía desplazar la página de inicio subyacente"
  ],
  "15.4.6": [
    "<strong>Optimización:</strong> estilo de la salida de texto"
  ],
  "15.4.2": [
    "<strong>Optimización:</strong> problema por el que la pantalla se desplazaba forzosamente hacia abajo mientras la IA generaba la salida"
  ],
  "15.3.8": [
    "<strong>Corrección:</strong> problema de contenido duplicado en la función de búsqueda"
  ],
  "15.3.7": [
    "<strong>Corrección:</strong> problema por el que el campo de entrada hacía que la pantalla se ampliara"
  ],
  "15.3.6": [
    "<strong>Corrección:</strong> problema de obstrucción del campo de entrada"
  ],
  "15.3.5": [
    "<strong>Corrección:</strong> problema por el que, en la versión móvil, las tablas de las respuestas de la IA sobresalían del área de la pantalla"
  ],
  "15.3.4": [
    "<strong>Nuevo:</strong> gemini2.5-Pro, versión preliminar de gemini2.5-flash y versión preliminar de gemini2.5-flash-lite",
    "<strong>Eliminado:</strong> modelo Pico"
  ],
  "15.3.3": [
    "<strong>BETA:</strong> versión de pruebas interna"
  ],
  "15.3.2": [
    "<strong>BETA:</strong> versión de pruebas interna"
  ],
  "15.3.1": [
    "<strong>Optimización:</strong> las preguntas de seguimiento se ajustarán mejor a los hábitos del usuario",
    "<strong>Sustitución:</strong> el modelo Mill se sustituye por el modelo Mistral3.2"
  ],
  "15.3.0": [
    "<strong>Nuevo:</strong> función de comentarios y propuestas de Nouras"
  ],
  "15.2.1": [
    "<strong>Corrección:</strong> en el campo de entrada, Enter pasa a insertar un salto de línea y Shift+Enter pasa a confirmar",
    "<strong>Corrección:</strong> problema por el que el código de las respuestas de la IA sobresalía del borde de la pantalla"
  ],
  "15.2.0": [
    "<strong>Corrección:</strong> el campo de entrada no permitía saltos de línea ni expandirse"
  ],
  "15.1.1": [
    "<strong>Corrección:</strong> problema de visualización incorrecta del botón + de funciones adicionales en los modelos de openrouter"
  ],
  "15.0.1": [
    "<strong>Corrección:</strong> problema de aparición errónea de la ventana de actualización",
    "<strong>Sustitución:</strong> el modelo Ultra se sustituye por Grok4-fash"
  ],
  "15.0.0": [
    "<strong>Nuevo:</strong> función de memoria entre chats",
    "<strong>Optimización:</strong> lógica y prompts de la función de memoria entre chats",
    "<strong>Optimización:</strong> lógica y prompts de las funciones de aprendizaje e investigación",
    "<strong>Corrección:</strong> problema por el que las funciones adicionales dentro y fuera del campo de entrada sobresalían por el lado derecho del campo",
    "<strong>Corrección:</strong> problema por el que la función de importación de la página de inicio de la versión móvil no podía importar",
    "<strong>Corrección:</strong> problema de superposición entre las funciones adicionales dentro y fuera del campo de entrada y el propio campo"
  ],
  "14.9.9": [
    "<strong>Optimización:</strong> lógica de las notificaciones push de actualización de versión"
  ],
  "14.9.8": [
    "<strong>Optimización:</strong> animación de las funciones extendidas del campo de entrada",
    "<strong>Optimización:</strong> problema de la tipografía poco nítida del campo de entrada"
  ],
  "14.9.7": [
    "<strong>Corrección:</strong> problema por el que el ancho superior e inferior del campo de entrada no era uniforme",
    "<strong>Corrección:</strong> problema por el que el campo de entrada no se contraía correctamente tras cancelar las funciones extendidas",
    "<strong>Optimización:</strong> forma de mostrar las funciones extendidas del campo de entrada"
  ],
  "14.9.6": [
    "<strong>Nuevo:</strong> se modifica la posición intermedia que usan la búsqueda en internet y Nouras"
  ],
  "14.9.5": [
    "<strong>Corrección:</strong> problema por el que el color de los botones no podía rellenarse con degradado"
  ],
  "14.9.4": [
    "<strong>Optimización:</strong> se modifica la transparencia del color de fondo del contenido adjunto del campo de entrada"
  ],
  "14.9.3": [
    "<strong>Corrección:</strong> problema por el que el contenido adjunto emergente del campo de entrada quedaba cubierto"
  ],
  "14.9.2": [
    "<strong>Optimización:</strong> problema de redirección de la Tienda Nouras"
  ],
  "14.9.1": [
    "<strong>Optimización:</strong> color de la tipografía de la Tienda Nouras"
  ],
  "14.9.0": [
    "<strong>Añadido:</strong> la Tienda Nouras integra el fondo de pantalla personalizado y añade un efecto de vidrio gelatinoso"
  ],
  "14.8.17": [
    "<strong>Añadido:</strong> efectos de interacción entre el campo de entrada del chat y el módulo de preguntas de seguimiento"
  ],
  "14.8.16": [
    "<strong>Optimización:</strong> se elimina en la versión móvil la ampliación mediante pellizco con dos dedos y mediante doble toque"
  ],
  "14.8.15": [
    "<strong>Optimización:</strong> optimización de las animaciones existentes"
  ],
  "14.8.14": [
    "<strong>Optimización:</strong> se modifica la lógica de despliegue y cierre de las preguntas de seguimiento"
  ],
  "14.8.13": [
    "<strong>Optimización:</strong> problema del tamaño excesivo del módulo de preguntas de seguimiento en la versión de escritorio",
    "<strong>Eliminado:</strong> superposición de la máscara gris al desplegar la barra lateral"
  ],
  "14.8.12": [
    "<strong>Optimización:</strong> material de vidrio gelatinoso de la barra lateral, de la barra de preguntas de seguimiento y de las burbujas de mensajes"
  ],
  "14.8.11": [
    "<strong>Optimización:</strong> el fondo de las preguntas de seguimiento pasa a un estilo de boya flotante",
    "<strong>Corrección:</strong> problema por el que el nombre de la ventana del chat no se adaptaba al cambiar"
  ],
  "14.8.10": [
    "<strong>Optimización:</strong> se reduce el área de texto seleccionable de la página para mejorar la experiencia de uso",
    "<strong>Nuevo:</strong> nueva función de reserva de mensajes: al cambiar de chat se conservan todos los mensajes enviados"
  ],
  "14.8.9": [
    "<strong>Nuevo:</strong> se añade en la página “Configuración” la función de papelera, que permite a los usuarios consultar los documentos eliminados, eliminarlos de forma permanente y restaurarlos."
  ],
  "14.8.8": [
    "<strong>Nuevo:</strong> se añade en la página “Acerca de” un acceso a la información de actualización de versiones, para que los usuarios puedan consultar el registro de cambios de todas las versiones.",
    "<strong>Nuevo:</strong> se añade el interruptor “Habilitar notificaciones de actualización”: al activarlo, en cada carga aparece una ventana con el contenido de la actualización de la versión más reciente.",
    "<strong>Optimización:</strong> el contenido del registro de cambios se centraliza en el archivo independiente update-logs.js, para facilitar su mantenimiento y modificación posteriores."
  ],
  "14.8.6": [
    "<strong>Nuevo:</strong> los elementos de la barra lateral de la versión móvil admiten pulsación larga para abrir el menú rápido.",
    "<strong>Optimización:</strong> el gráfico de distribución de mensajes del panel de datos incorpora filtros por año/mes/día.",
    "<strong>Corrección:</strong> se corrige el problema de la visualización poco clara de los elementos de la página de la Tienda Nouras en el modo de fondo de pantalla personalizado."
  ],
  "14.8.5": [
    "<strong>Nuevo:</strong> nuevo panel de datos personales, que ofrece gráficos estadísticos como la proporción de uso de modelos y la distribución del número de mensajes.",
    "<strong>Nuevo:</strong> botón “Desplazarse al final”, que permite saltar rápidamente al mensaje más reciente cuando hay muchos mensajes.",
    "<strong>Optimización:</strong> función de búsqueda en lenguaje natural, que ahora calcula una puntuación de relevancia según el peso de las palabras clave, para que los resultados de búsqueda sean más precisos."
  ]
};
