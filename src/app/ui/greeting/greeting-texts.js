// The words of the greeting of an empty chat, in the five languages (docs/superpowers/specs/2026-11-05-dynamic-greeting-design.md). Each language has its own lines for the parts of the day, for Monday, Friday and the weekend,
// and its own list of the well-known holidays of the places where it is spoken (not the same list in every language: a holiday of a country is in the language of that country).
// `{name}` is where the name of the person goes (some lines have none, so the name comes "when it fits"). A line is polite in the way the language is in the rest of the application.
// pools: lateNight (0-5 h: the night owl), dawn (5-9), morning (9-12), noon (12-14), afternoon (14-18), evening (18-22), night (22-24), and monday, friday, saturday, sunday (added to the part of the day).
// holidays: the first one that holds is taken, so the order is the order of importance. `rule` is plain data (greeting.js ruleHolds): date [month, day], nth [month, weekday 0 = Sunday, n or -1 = last],
// lunar [month, day] (the Chinese calendar), lunarEve, easter / orthodox (days from Easter Sunday), notEaster, tz / notTz (the start of a time zone name, for a holiday of one country); `span`: how many days it lasts.

export const GREETING_TEXTS = {
  'zh-TW': {
    pools: {
      lateNight: ['夜貓子，{name}，這麼晚還沒睡？', '深夜時段，夜貓子專屬。有什麼我可以幫忙的？', '凌晨了，先說說您需要什麼，別熬太晚。'],
      dawn: ['早安，{name}。今天想從哪裡開始？', '這麼早起，有什麼我可以幫忙的？', '新的一天開始了，先從哪件事著手？'],
      morning: ['{name}，上午好。今天想處理什麼？', '有什麼想問的、想做的，都可以從這裡開始。', '今天想聊點什麼？'],
      noon: ['午安，{name}。吃過午餐了嗎？', '午休前後，有什麼我可以幫忙的？', '趁午休，來解決一件小事吧。'],
      afternoon: ['下午好，{name}。需要我幫什麼忙？', '下午了，還有什麼事想一起處理？', '來杯咖啡或茶，我們慢慢來。'],
      evening: ['晚上好，{name}。今天過得怎麼樣？', '忙了一天，現在想聊點什麼？', '晚上了，有什麼我可以幫忙的？'],
      night: ['夜深了，{name}。還有什麼想處理的？', '這麼晚了，來聊聊吧。', '準備休息前，還有什麼想問的嗎？'],
      monday: ['新的一週開始了，今天先從哪件事開始？', '週一加油，{name}。有什麼我可以幫忙的？'],
      friday: ['週五了，{name}。把這週的事收個尾吧？', '快到週末了，還有什麼想完成的？'],
      saturday: ['週六愉快，{name}。今天想做點什麼？', '週末時光，慢慢來。有什麼想聊的？'],
      sunday: ['週日愉快，{name}。今天想聊點什麼？', '悠閒的週日，有什麼想一起做的？']
    },
    holidays: [
      { id: 'lunarNewYearEve', rule: { lunarEve: true }, texts: ['除夕快樂，{name}！祝您團圓平安。', '今天除夕，祝您和家人團聚、平安喜樂。'] },
      { id: 'lunarNewYear', rule: { lunar: [1, 1] }, span: 3, texts: ['新年快樂，{name}！祝您新的一年萬事如意。', '恭喜發財！新的一年，想一起做些什麼？'] },
      { id: 'lanternFestival', rule: { lunar: [1, 15] }, texts: ['元宵節快樂，{name}！記得吃碗湯圓。', '元宵節快樂，賞燈、吃湯圓，也別忘了休息。'] },
      { id: 'newYear', rule: { date: [1, 1] }, texts: ['新年快樂，{name}！新的一年想一起完成什麼？', '元旦快樂！新的一年，從一個好問題開始。'] },
      { id: 'newYearEve', rule: { date: [12, 31] }, texts: ['跨年夜快樂，{name}！今年過得如何？', '今年的最後一天，有什麼想收尾的嗎？'] },
      { id: 'valentine', rule: { date: [2, 14] }, texts: ['情人節快樂，{name}！', '情人節快樂，今天想為重要的人做點什麼？'] },
      { id: 'mothersDay', rule: { nth: [5, 0, 2] }, texts: ['母親節快樂！記得跟媽媽說聲謝謝。', '母親節快樂，{name}。今天有為媽媽準備什麼嗎？'] },
      { id: 'fathersDay', rule: { date: [8, 8] }, texts: ['父親節快樂！別忘了跟爸爸說聲辛苦了。', '父親節快樂，{name}。'] },
      { id: 'dragonBoat', rule: { lunar: [5, 5] }, texts: ['端午節快樂，{name}！記得吃粽子。', '端午安康，{name}。'] },
      { id: 'qixi', rule: { lunar: [7, 7] }, texts: ['七夕快樂，{name}！', '七夕情人節快樂，今天有什麼計畫嗎？'] },
      { id: 'midAutumn', rule: { lunar: [8, 15] }, texts: ['中秋節快樂，{name}！月圓人團圓。', '中秋快樂，今晚記得賞月、烤肉。'] },
      { id: 'nationalDay', rule: { date: [10, 10] }, texts: ['國慶日快樂，{name}！', '雙十國慶快樂，今天想做點什麼？'] },
      { id: 'halloween', rule: { date: [10, 31] }, texts: ['萬聖節快樂，{name}！不給糖就搗蛋？', '萬聖節快樂，今天有扮裝嗎？'] },
      { id: 'christmasEve', rule: { date: [12, 24] }, texts: ['平安夜快樂，{name}！', '平安夜快樂，祝您有個溫暖的夜晚。'] },
      { id: 'christmas', rule: { date: [12, 25] }, texts: ['聖誕快樂，{name}！', '聖誕快樂！今天有什麼我可以幫忙的？'] }
    ]
  },
  en: {
    pools: {
      lateNight: ['Night owl, {name}? What are you up to?', 'Still up? Night owls are welcome. What can I help with?', 'Late night, night owl. What is on your mind?'],
      dawn: ['Good morning, {name}. Where would you like to start?', 'An early start. What can I help with?', 'A new day. What is first on your list?'],
      morning: ['Good morning, {name}. What are we working on today?', 'What is on your mind this morning?', 'Ready when you are.'],
      noon: ['Good afternoon, {name}. Had lunch yet?', 'Midday check-in. What can I help with?', 'A quick task before lunch?'],
      afternoon: ['Good afternoon, {name}. What can I help with?', 'Afternoon already. What would you like to get done?', 'Grab a coffee, and let us get something done.'],
      evening: ['Good evening, {name}. How was your day?', 'Winding down? What can I help with?', 'What would you like to talk about tonight?'],
      night: ['It is getting late, {name}. Anything left to sort out?', 'One more thing before bed?', 'Burning the midnight oil? What can I help with?'],
      monday: ['Happy Monday, {name}. What is first this week?', 'A fresh week. What shall we start with?'],
      friday: ['Happy Friday, {name}. Let us wrap up the week.', 'Almost the weekend. What is left to finish?'],
      saturday: ['Happy Saturday, {name}. What is the plan?', 'Weekend mode. What would you like to do?'],
      sunday: ['Happy Sunday, {name}. What would you like to talk about?', 'A slow Sunday. What is on your mind?']
    },
    holidays: [
      { id: 'lunarNewYear', rule: { lunar: [1, 1] }, span: 3, texts: ['Happy Lunar New Year, {name}!', 'Happy Lunar New Year! What shall we do first this year?'] },
      { id: 'newYear', rule: { date: [1, 1] }, texts: ['Happy New Year, {name}! What shall we do first this year?', 'Happy New Year! A new year starts with a good question.'] },
      { id: 'newYearEve', rule: { date: [12, 31] }, texts: ['Happy New Year\'s Eve, {name}! How was your year?', 'The last day of the year. Anything you want to wrap up?'] },
      { id: 'valentine', rule: { date: [2, 14] }, texts: ['Happy Valentine\'s Day, {name}!', 'Happy Valentine\'s Day. Doing something for someone special today?'] },
      { id: 'stPatrick', rule: { date: [3, 17] }, texts: ['Happy St. Patrick\'s Day, {name}!', 'Happy St. Patrick\'s Day! What can I help with?'] },
      { id: 'easter', rule: { easter: 0 }, texts: ['Happy Easter, {name}!', 'Happy Easter! What would you like to do today?'] },
      { id: 'mothersDay', rule: { nth: [5, 0, 2], notTz: ['Europe/'] }, texts: ['Happy Mother\'s Day! Have you called your mom?', 'Happy Mother\'s Day, {name}.'] },
      { id: 'fathersDay', rule: { nth: [6, 0, 3], notTz: ['Australia/', 'Pacific/Auckland'] }, texts: ['Happy Father\'s Day! Have you called your dad?', 'Happy Father\'s Day, {name}.'] },
      { id: 'independenceDay', rule: { date: [7, 4], tz: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Detroit', 'America/Boise', 'America/Indiana/', 'America/Kentucky/', 'Pacific/Honolulu'] }, texts: ['Happy Fourth of July, {name}!', 'Happy Independence Day! What can I help with?'] },
      { id: 'halloween', rule: { date: [10, 31] }, texts: ['Happy Halloween, {name}! Trick or treat?', 'Happy Halloween! Are you dressing up?'] },
      { id: 'thanksgiving', rule: { nth: [11, 4, 4], tz: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Detroit', 'America/Boise', 'America/Indiana/', 'America/Kentucky/', 'Pacific/Honolulu'] }, texts: ['Happy Thanksgiving, {name}!', 'Happy Thanksgiving! What are you thankful for today?'] },
      { id: 'christmasEve', rule: { date: [12, 24] }, texts: ['Merry Christmas Eve, {name}!', 'Christmas Eve. Wishing you a warm evening.'] },
      { id: 'christmas', rule: { date: [12, 25] }, texts: ['Merry Christmas, {name}!', 'Merry Christmas! What can I help with today?'] }
    ]
  },
  fr: {
    pools: {
      lateNight: ['Oiseau de nuit, {name} ? Que puis-je faire pour vous ?', 'Encore debout ? Les noctambules sont les bienvenus.', 'En pleine nuit. Qu’avez-vous en tête ?'],
      dawn: ['Bonjour {name}. Par quoi commence-t-on ?', 'Une nouvelle journée commence. Que puis-je faire pour vous ?', 'Bien matinal ! Par quoi voulez-vous commencer ?'],
      morning: ['Bonjour {name}. Sur quoi travaillons-nous aujourd’hui ?', 'Qu’avez-vous en tête ce matin ?', 'Je suis prêt quand vous l’êtes.'],
      noon: ['Bonne pause déjeuner, {name}. Que puis-je faire pour vous ?', 'Midi déjà. Une petite tâche à régler ?', 'Avez-vous déjeuné ? Dites-moi ce qu’il vous faut.'],
      afternoon: ['Bon après-midi, {name}. Comment puis-je vous aider ?', 'L’après-midi est là. Qu’aimeriez-vous accomplir ?', 'Un café, et on s’y met ?'],
      evening: ['Bonsoir {name}. Comment s’est passée votre journée ?', 'La journée touche à sa fin. De quoi voulez-vous parler ?', 'Bonsoir ! Que puis-je faire pour vous ce soir ?'],
      night: ['Il se fait tard, {name}. Encore quelque chose à régler ?', 'Une dernière chose avant de dormir ?', 'Il est tard. Que puis-je faire pour vous ?'],
      monday: ['Bon lundi, {name}. Par quoi commence la semaine ?', 'Nouvelle semaine ! Par où commence-t-on ?'],
      friday: ['Bon vendredi, {name}. On boucle la semaine ?', 'Presque le week-end. Que reste-t-il à terminer ?'],
      saturday: ['Bon samedi, {name}. Un programme pour aujourd’hui ?', 'C’est le week-end. De quoi avez-vous envie ?'],
      sunday: ['Bon dimanche, {name}. De quoi voulez-vous parler ?', 'Un dimanche tranquille. Qu’avez-vous en tête ?']
    },
    holidays: [
      { id: 'newYear', rule: { date: [1, 1] }, texts: ['Bonne année, {name} !', 'Bonne année ! Une nouvelle année commence par une bonne question.'] },
      { id: 'valentine', rule: { date: [2, 14] }, texts: ['Joyeuse Saint-Valentin, {name} !', 'Joyeuse Saint-Valentin. Une attention pour quelqu’un de spécial ?'] },
      { id: 'easter', rule: { easter: 0 }, texts: ['Joyeuses Pâques, {name} !', 'Joyeuses Pâques ! Que puis-je faire pour vous aujourd’hui ?'] },
      { id: 'labourDay', rule: { date: [5, 1] }, texts: ['Bonne fête du Travail, {name} !', 'Bon 1er mai ! Que puis-je faire pour vous ?'] },
      { id: 'mothersDay', rule: { nth: [5, 0, -1], notEaster: 49 }, texts: ['Bonne fête des mères ! Un petit mot pour votre maman ?', 'Bonne fête des mères, {name}.'] },
      { id: 'mothersDayPentecost', rule: { nth: [6, 0, 1], easter: 56 }, texts: ['Bonne fête des mères ! Un petit mot pour votre maman ?', 'Bonne fête des mères, {name}.'] },
      { id: 'musicDay', rule: { date: [6, 21] }, texts: ['Bonne fête de la Musique, {name} !', 'Fête de la Musique aujourd’hui. Quelle sera votre playlist ?'] },
      { id: 'fathersDay', rule: { nth: [6, 0, 3] }, texts: ['Bonne fête des pères ! Un petit mot pour votre papa ?', 'Bonne fête des pères, {name}.'] },
      { id: 'bastilleDay', rule: { date: [7, 14] }, texts: ['Bonne fête nationale, {name} !', 'Joyeux 14 juillet ! Que puis-je faire pour vous ?'] },
      { id: 'halloween', rule: { date: [10, 31] }, texts: ['Joyeux Halloween, {name} ! Des bonbons ou un sort ?', 'Joyeux Halloween ! Un déguisement cette année ?'] },
      { id: 'allSaints', rule: { date: [11, 1] }, texts: ['Bonne Toussaint, {name}.', 'Bonne Toussaint. Que puis-je faire pour vous ?'] },
      { id: 'newYearEve', rule: { date: [12, 31] }, texts: ['Bon réveillon, {name} ! Comment était votre année ?', 'Dernier jour de l’année. Quelque chose à terminer ?'] },
      { id: 'christmasEve', rule: { date: [12, 24] }, texts: ['Joyeux réveillon de Noël, {name} !', 'Réveillon de Noël. Je vous souhaite une belle soirée.'] },
      { id: 'christmas', rule: { date: [12, 25] }, texts: ['Joyeux Noël, {name} !', 'Joyeux Noël ! Que puis-je faire pour vous aujourd’hui ?'] }
    ]
  },
  ru: {
    pools: {
      lateNight: ['Ночная сова, {name}? Чем могу помочь?', 'Ещё не спите? Совам здесь рады.', 'Глубокая ночь. О чём думаете?'],
      dawn: ['Доброе утро, {name}! С чего начнём?', 'Новый день начинается. Чем могу помочь?', 'Вы рано встали. Что будем делать?'],
      morning: ['Доброе утро, {name}. Над чем работаем сегодня?', 'О чём вы думаете этим утром?', 'Готов, когда будете готовы вы.'],
      noon: ['Добрый день, {name}. Вы уже обедали?', 'Полдень. Чем могу помочь?', 'Небольшое дело до обеда?'],
      afternoon: ['Добрый день, {name}. Чем могу помочь?', 'Уже день. Что хотите успеть сделать?', 'Чашка кофе — и за дело?'],
      evening: ['Добрый вечер, {name}. Как прошёл ваш день?', 'День подходит к концу. О чём поговорим?', 'Добрый вечер! Чем могу помочь сегодня?'],
      night: ['Уже поздно, {name}. Осталось ещё что-нибудь?', 'Последнее дело перед сном?', 'Поздний час. Чем могу помочь?'],
      monday: ['Хорошей недели, {name}! С чего начнём?', 'Новая неделя. Чем займёмся первым делом?'],
      friday: ['Хорошей пятницы, {name}. Подведём итоги недели?', 'Скоро выходные. Что ещё нужно закончить?'],
      saturday: ['Хорошей субботы, {name}. Какие планы?', 'Выходной. Чем хотите заняться?'],
      sunday: ['Хорошего воскресенья, {name}. О чём поговорим?', 'Спокойное воскресенье. О чём думаете?']
    },
    holidays: [
      { id: 'newYearEve', rule: { date: [12, 31] }, texts: ['С наступающим Новым годом, {name}!', 'Последний день года. Что хотите завершить?'] },
      { id: 'newYear', rule: { date: [1, 1] }, texts: ['С Новым годом, {name}!', 'С Новым годом! Пусть год принесёт много хорошего.'] },
      { id: 'christmas', rule: { date: [1, 7] }, texts: ['С Рождеством, {name}!', 'Светлого Рождества!'] },
      { id: 'valentine', rule: { date: [2, 14] }, texts: ['С Днём святого Валентина, {name}!', 'С Днём святого Валентина! Есть планы на вечер?'] },
      { id: 'defenderDay', rule: { date: [2, 23] }, texts: ['С Днём защитника Отечества, {name}!', 'С 23 Февраля! Чем могу помочь?'] },
      { id: 'womenDay', rule: { date: [3, 8] }, texts: ['С 8 Марта, {name}!', 'С Международным женским днём! Чем могу помочь?'] },
      { id: 'easter', rule: { orthodox: 0 }, texts: ['Христос воскресе! С Пасхой, {name}!', 'С Пасхой! Светлого праздника.'] },
      { id: 'labourDay', rule: { date: [5, 1] }, texts: ['С праздником Весны и Труда, {name}!', 'С Первомаем! Чем могу помочь?'] },
      { id: 'victoryDay', rule: { date: [5, 9] }, texts: ['С Днём Победы, {name}!', 'С Днём Победы! Мирного неба.'] },
      { id: 'russiaDay', rule: { date: [6, 12] }, texts: ['С Днём России, {name}!', 'С Днём России! Чем могу помочь?'] },
      { id: 'knowledgeDay', rule: { date: [9, 1] }, texts: ['С Днём знаний, {name}!', 'С 1 сентября! Новый учебный год — новые вопросы.'] },
      { id: 'mothersDay', rule: { nth: [11, 0, -1] }, texts: ['С Днём матери! Позвонили маме?', 'С Днём матери, {name}.'] }
    ]
  },
  es: {
    pools: {
      lateNight: ['¿Trasnochando, {name}? ¿En qué le puedo ayudar?', 'Los noctámbulos son bienvenidos. ¿Qué tiene en mente?', '¿Es usted un búho nocturno? ¿Qué necesita?'],
      dawn: ['Buenos días, {name}. ¿Por dónde empezamos?', 'Un nuevo día comienza. ¿En qué le puedo ayudar?', 'Qué buen madrugón. ¿Qué necesita?'],
      morning: ['Buenos días, {name}. ¿En qué trabajamos hoy?', '¿Qué tiene en mente esta mañana?', 'Listo cuando usted lo esté.'],
      noon: ['Buenas tardes, {name}. ¿Ya almorzó?', 'Es mediodía. ¿En qué le puedo ayudar?', '¿Una tarea rápida antes de comer?'],
      afternoon: ['Buenas tardes, {name}. ¿En qué le puedo ayudar?', 'Ya es la tarde. ¿Qué le gustaría resolver?', 'Un café y manos a la obra.'],
      evening: ['Muy buenas, {name}. ¿Cómo estuvo su día?', 'El día se acaba. ¿De qué quiere hablar?', '¿En qué le puedo ayudar esta noche?'],
      night: ['Se hace tarde, {name}. ¿Queda algo por resolver?', '¿Una última cosa antes de dormir?', 'Es tarde. ¿En qué le puedo ayudar?'],
      monday: ['Feliz lunes, {name}. ¿Por dónde empieza la semana?', 'Semana nueva. ¿Por dónde empezamos?'],
      friday: ['Feliz viernes, {name}. ¿Cerramos la semana?', 'Casi fin de semana. ¿Qué queda por terminar?'],
      saturday: ['Feliz sábado, {name}. ¿Algún plan?', 'Es fin de semana. ¿Qué le apetece hacer?'],
      sunday: ['Feliz domingo, {name}. ¿De qué quiere hablar?', 'Un domingo tranquilo. ¿Qué tiene en mente?']
    },
    holidays: [
      { id: 'newYear', rule: { date: [1, 1] }, texts: ['¡Feliz Año Nuevo, {name}!', '¡Feliz Año Nuevo! Un año nuevo empieza con una buena pregunta.'] },
      { id: 'epiphany', rule: { date: [1, 6] }, texts: ['¡Feliz día de Reyes, {name}!', '¡Feliz día de Reyes! ¿Qué le trajeron los Reyes Magos?'] },
      { id: 'valentine', rule: { date: [2, 14] }, texts: ['¡Feliz San Valentín, {name}!', 'Feliz San Valentín. ¿Un detalle para alguien especial?'] },
      { id: 'holyWeek', rule: { easter: -7 }, span: 7, texts: ['Feliz Semana Santa, {name}.', 'Semana Santa. ¿En qué le puedo ayudar?'] },
      { id: 'easter', rule: { easter: 0 }, texts: ['¡Felices Pascuas, {name}!', '¡Felices Pascuas! ¿En qué le puedo ayudar hoy?'] },
      { id: 'labourDay', rule: { date: [5, 1] }, texts: ['Feliz Día del Trabajo, {name}.', 'Feliz 1 de mayo. ¿En qué le puedo ayudar?'] },
      { id: 'mothersDaySpain', rule: { nth: [5, 0, 1], tz: ['Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta'] }, texts: ['¡Feliz Día de la Madre! ¿Ya llamó a su mamá?', 'Feliz Día de la Madre, {name}.'] },
      { id: 'mothersDayMexico', rule: { date: [5, 10], tz: ['America/Mexico_City', 'America/Cancun', 'America/Monterrey', 'America/Merida', 'America/Tijuana', 'America/Chihuahua', 'America/Hermosillo', 'America/Mazatlan', 'America/Matamoros'] }, texts: ['¡Feliz Día de las Madres! ¿Ya llamó a su mamá?', 'Feliz Día de las Madres, {name}.'] },
      { id: 'mothersDay', rule: { nth: [5, 0, 2], notTz: ['Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta', 'America/Mexico_City', 'America/Cancun', 'America/Monterrey', 'America/Merida', 'America/Tijuana', 'America/Chihuahua', 'America/Hermosillo', 'America/Mazatlan', 'America/Matamoros'] }, texts: ['¡Feliz Día de la Madre! ¿Ya llamó a su mamá?', 'Feliz Día de la Madre, {name}.'] },
      { id: 'fathersDaySpain', rule: { date: [3, 19], tz: ['Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta'] }, texts: ['¡Feliz Día del Padre! ¿Ya llamó a su papá?', 'Feliz Día del Padre, {name}.'] },
      { id: 'fathersDay', rule: { nth: [6, 0, 3], notTz: ['Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta'] }, texts: ['¡Feliz Día del Padre! ¿Ya llamó a su papá?', 'Feliz Día del Padre, {name}.'] },
      { id: 'halloween', rule: { date: [10, 31] }, texts: ['¡Feliz Halloween, {name}! ¿Dulce o truco?', '¡Feliz Halloween! ¿Se disfrazó este año?'] },
      { id: 'deadMexico', rule: { date: [11, 1], tz: ['America/Mexico_City', 'America/Cancun', 'America/Monterrey', 'America/Merida', 'America/Tijuana', 'America/Chihuahua', 'America/Hermosillo', 'America/Mazatlan', 'America/Matamoros'] }, span: 2, texts: ['Feliz Día de Muertos, {name}.', 'Día de Muertos. ¿Ya puso la ofrenda?'] },
      { id: 'allSaints', rule: { date: [11, 1] }, texts: ['Feliz Día de Todos los Santos, {name}.', 'Día de Todos los Santos. ¿En qué le puedo ayudar?'] },
      { id: 'newYearEve', rule: { date: [12, 31] }, texts: ['¡Feliz Nochevieja, {name}! ¿Cómo fue su año?', 'Último día del año. ¿Algo que quiera cerrar?'] },
      { id: 'christmasEve', rule: { date: [12, 24] }, texts: ['¡Feliz Nochebuena, {name}!', 'Nochebuena. Le deseo una noche cálida.'] },
      { id: 'christmas', rule: { date: [12, 25] }, texts: ['¡Feliz Navidad, {name}!', '¡Feliz Navidad! ¿En qué le puedo ayudar hoy?'] }
    ]
  }
};
