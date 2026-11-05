import assert from 'node:assert/strict';
import test from 'node:test';

import { GREETING_TEXTS } from '../src/app/ui/greeting/greeting-texts.js';
import { dayPart, friendlyName, greetingHtml, lunarDate, nthWeekday, orthodoxEaster, pickGreeting, putName, westernEaster } from '../src/app/ui/greeting/greeting.js';

// The greeting of an empty chat follows the clock, the day of the week and the well-known holidays of the language (docs/superpowers/specs/2026-11-05-dynamic-greeting-design.md).

const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];
const at = (year, month, day, hour = 10) => new Date(year, month - 1, day, hour, 30);
const greet = (language, date, extra = {}) => pickGreeting({ date, language, name: 'Allen', ...extra });

test('the calendars: Easter of both churches, the nth weekday of a month and the Chinese calendar', () => {
  assert.deepEqual(westernEaster(2026), { month: 4, day: 5 });
  assert.deepEqual(westernEaster(2025), { month: 4, day: 20 });
  assert.deepEqual(westernEaster(2038), { month: 4, day: 25 });
  assert.deepEqual(orthodoxEaster(2026), { month: 4, day: 12 });
  assert.deepEqual(orthodoxEaster(2025), { month: 4, day: 20 });
  assert.deepEqual(orthodoxEaster(2024), { month: 5, day: 5 });
  assert.equal(nthWeekday(2026, 5, 0, 2), 10, 'the second Sunday of May 2026');
  assert.equal(nthWeekday(2026, 11, 4, 4), 26, 'the fourth Thursday of November 2026');
  assert.equal(nthWeekday(2026, 5, 0, -1), 31, 'the last Sunday of May 2026');
  const lunar = lunarDate(at(2026, 2, 17));
  assert.deepEqual([lunar.month, lunar.day, lunar.leap], [1, 1, false], 'the Chinese New Year of 2026');
  assert.deepEqual([lunarDate(at(2026, 6, 19)).month, lunarDate(at(2026, 6, 19)).day], [5, 5]);
  assert.deepEqual([lunarDate(at(2026, 9, 25)).month, lunarDate(at(2026, 9, 25)).day], [8, 15]);
});

test('the parts of the day, and a night owl whatever the day', () => {
  assert.deepEqual([0, 4, 5, 8, 9, 11, 12, 13, 14, 17, 18, 21, 22, 23].map(dayPart), ['lateNight', 'lateNight', 'dawn', 'dawn', 'morning', 'morning', 'noon', 'noon', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  for (const language of LANGUAGES) {
    for (const day of [2, 4, 6, 10]) {
      const line = greet(language, at(2026, 3, day, 2));
      assert.equal(line.kind, 'night', `${language}: a night owl on day ${day}`);
      assert.ok(GREETING_TEXTS[language].pools.lateNight.some((text) => putName(text, 'Allen') === line.text));
    }
  }
  assert.ok(GREETING_TEXTS['zh-TW'].pools.lateNight.filter((text) => /夜貓子/.test(text)).length >= 2, 'the night owl is in the Chinese lines');
});

test('the same hour of the same day gives the same line, and another hour or day can give another one', () => {
  for (const language of LANGUAGES) {
    assert.equal(greet(language, at(2026, 3, 4, 15)).text, greet(language, at(2026, 3, 4, 15)).text);
    const lines = new Set();
    for (let day = 2; day < 30; day += 1) lines.add(greet(language, at(2026, 3, day, 15)).text);
    assert.ok(lines.size >= 5, `${language}: the lines change from day to day`);
  }
});

test('Monday, Friday and the weekend have lines of their own, mixed into the lines of the part of the day', () => {
  const monday = new Set();
  for (let hour = 5; hour < 22; hour += 1) for (let day = 2; day <= 30; day += 7) monday.add(greet('en', at(2026, 3, day, hour)).text);
  assert.ok([...monday].some((text) => /Monday/.test(text)), 'a Monday line comes up on Mondays');
  const wednesday = new Set();
  for (let hour = 5; hour < 22; hour += 1) for (let day = 4; day <= 25; day += 7) wednesday.add(greet('en', at(2026, 3, day, hour)).text);
  assert.ok(![...wednesday].some((text) => /Monday|Friday|Saturday|Sunday/.test(text)), 'a Wednesday has no line of a day of the week');
});

test('Chinese: the holidays of Taiwan, with the Chinese calendar', () => {
  const on = (month, day, hour) => greet('zh-TW', at(2026, month, day, hour));
  assert.equal(on(2, 16).id, 'lunarNewYearEve');
  assert.match(on(2, 16).text, /除夕/);
  for (const day of [17, 18, 19]) assert.equal(on(2, day).id, 'lunarNewYear', `the spring festival lasts three days (${day})`);
  assert.notEqual(on(2, 20).kind, 'holiday');
  assert.equal(on(3, 3).id, 'lanternFestival');
  assert.equal(on(6, 19).id, 'dragonBoat');
  assert.equal(on(8, 19).id, 'qixi');
  assert.equal(on(9, 25).id, 'midAutumn');
  assert.equal(on(5, 10).id, 'mothersDay');
  assert.equal(on(8, 8).id, 'fathersDay');
  assert.equal(on(10, 10).id, 'nationalDay');
  assert.deepEqual([[1, 1], [2, 14], [10, 31], [12, 24], [12, 25], [12, 31]].map(([month, day]) => on(month, day).id), ['newYear', 'valentine', 'halloween', 'christmasEve', 'christmas', 'newYearEve']);
  assert.equal(on(3, 8).kind, 'day', 'no Women\'s Day and no Double Ninth: only the well-known holidays');
  assert.equal(on(10, 18).kind, 'day');
  assert.equal(on(12, 25, 2).id, 'christmas', 'a holiday wins over the night owl');
});

test('English: the holidays that are everywhere, and those of the United States only in its time zones', () => {
  const us = 'America/Chicago';
  assert.equal(greet('en', at(2026, 12, 25)).id, 'christmas');
  assert.equal(greet('en', at(2026, 4, 5)).id, 'easter');
  assert.equal(greet('en', at(2026, 2, 17)).id, 'lunarNewYear');
  assert.equal(greet('en', at(2026, 11, 26), { timeZone: us }).id, 'thanksgiving');
  assert.notEqual(greet('en', at(2026, 11, 26), { timeZone: 'Europe/London' }).kind, 'holiday');
  assert.equal(greet('en', at(2026, 7, 4), { timeZone: us }).id, 'independenceDay');
  assert.notEqual(greet('en', at(2026, 7, 4), { timeZone: 'Asia/Taipei' }).kind, 'holiday');
  assert.equal(greet('en', at(2026, 5, 10), { timeZone: us }).id, 'mothersDay');
  assert.notEqual(greet('en', at(2026, 5, 10), { timeZone: 'Europe/London' }).kind, 'holiday', 'Mother\'s Day is another day in Britain');
  assert.equal(greet('en', at(2026, 6, 21), { timeZone: us }).id, 'fathersDay');
});

test('French: the holidays of France, and Mother\'s Day moves to June when the last Sunday of May is Pentecost', () => {
  assert.equal(greet('fr', at(2026, 7, 14)).id, 'bastilleDay');
  assert.equal(greet('fr', at(2026, 6, 21)).id, 'musicDay');
  assert.equal(greet('fr', at(2026, 5, 31)).id, 'mothersDay');
  assert.equal(greet('fr', at(2026, 11, 1)).id, 'allSaints');
  for (let year = 2020; year <= 2070; year += 1) {
    const matches = [];
    for (let day = 1; day <= 31; day += 1) {
      if (greet('fr', at(year, 5, day)).id?.startsWith('mothersDay')) matches.push(`5-${day}`);
      if (day <= 30 && greet('fr', at(year, 6, day)).id?.startsWith('mothersDay')) matches.push(`6-${day}`);
    }
    assert.equal(matches.length, 1, `exactly one Mother's Day in ${year}: ${matches}`);
    const easter = westernEaster(year);
    const pentecost = new Date(year, easter.month - 1, easter.day + 49);
    const [month, day] = matches[0].split('-').map(Number);
    assert.equal(new Date(year, month - 1, day).getDay(), 0, 'a Sunday');
    assert.ok(!(pentecost.getMonth() + 1 === month && pentecost.getDate() === day), `not on Pentecost (${year})`);
  }
});

test('Russian: the Orthodox Easter, and the holidays of Russia', () => {
  assert.equal(greet('ru', at(2026, 4, 12)).id, 'easter');
  assert.equal(greet('ru', at(2024, 5, 5)).id, 'easter');
  assert.equal(greet('ru', at(2026, 5, 9)).id, 'victoryDay');
  assert.equal(greet('ru', at(2026, 3, 8)).id, 'womenDay');
  assert.equal(greet('ru', at(2026, 1, 7)).id, 'christmas');
  assert.equal(greet('ru', at(2026, 11, 29)).id, 'mothersDay');
});

test('Spanish: the holidays follow the country of the time zone (Spain, Mexico, the rest)', () => {
  const spain = 'Europe/Madrid';
  const mexico = 'America/Mexico_City';
  const other = 'America/Bogota';
  assert.equal(greet('es', at(2026, 5, 3), { timeZone: spain }).id, 'mothersDaySpain');
  assert.equal(greet('es', at(2026, 5, 10), { timeZone: mexico }).id, 'mothersDayMexico');
  assert.equal(greet('es', at(2026, 5, 10), { timeZone: other }).id, 'mothersDay');
  assert.notEqual(greet('es', at(2026, 5, 10), { timeZone: spain }).kind, 'holiday');
  assert.equal(greet('es', at(2026, 3, 19), { timeZone: spain }).id, 'fathersDaySpain');
  assert.equal(greet('es', at(2026, 6, 21), { timeZone: other }).id, 'fathersDay');
  assert.equal(greet('es', at(2026, 11, 1), { timeZone: mexico }).id, 'deadMexico');
  assert.equal(greet('es', at(2026, 11, 2), { timeZone: mexico }).id, 'deadMexico');
  assert.equal(greet('es', at(2026, 11, 1), { timeZone: spain }).id, 'allSaints');
  assert.equal(greet('es', at(2026, 1, 6)).id, 'epiphany');
  assert.equal(greet('es', at(2026, 3, 29)).id, 'holyWeek', 'Palm Sunday 2026');
  assert.equal(greet('es', at(2026, 4, 4)).id, 'holyWeek');
  assert.equal(greet('es', at(2026, 4, 5)).id, 'easter');
});

test('the name goes where the line has it, and is left out cleanly when there is none', () => {
  assert.equal(putName('Good morning, {name}. What now?', 'Allen'), 'Good morning, Allen. What now?');
  assert.equal(putName('Good morning, {name}. What now?', ''), 'Good morning. What now?');
  assert.equal(putName('{name}，上午好。今天想處理什麼？', ''), '上午好。今天想處理什麼？');
  assert.equal(putName('Bonjour {name}. Par quoi ?', ''), 'Bonjour. Par quoi ?');
  assert.equal(putName('Bon appétit, {name} ! Une question ?', ''), 'Bon appétit ! Une question ?');
  assert.equal(putName('¿Trasnochando, {name}? ¿En qué?', ''), '¿Trasnochando? ¿En qué?');
  assert.equal(friendlyName('allen@example.com'), 'allen');
  assert.equal(friendlyName('allen Niu'), 'allen Niu');
  assert.equal(friendlyName(null), '');
});

test('every language has the same parts, enough lines, only the {name} place, and a line for every hour and every day of a year (with and without a name)', () => {
  const parts = Object.keys(GREETING_TEXTS['zh-TW'].pools);
  for (const language of LANGUAGES) {
    const words = GREETING_TEXTS[language];
    assert.deepEqual(Object.keys(words.pools), parts, `${language}: the same parts`);
    for (const [part, lines] of Object.entries(words.pools)) {
      assert.ok(lines.length >= (['monday', 'friday', 'saturday', 'sunday'].includes(part) ? 2 : 7), `${language} ${part}: enough lines`);
      assert.equal(new Set(lines).size, lines.length, `${language} ${part}: no line twice`);
    }
    const ids = words.holidays.map((holiday) => holiday.id);
    assert.equal(new Set(ids).size, ids.length, `${language}: a holiday once`);
    for (const holiday of words.holidays) assert.ok(holiday.texts.length >= 2 && holiday.rule, `${language} ${holiday.id}`);
    const all = [...Object.values(words.pools).flat(), ...words.holidays.flatMap((holiday) => holiday.texts)];
    for (const line of all) assert.equal(line.replaceAll('{name}', '').includes('{'), false, `${language}: only {name} is a place: ${line}`);
    for (const name of ['Allen', '']) {
      for (let dayOfYear = 0; dayOfYear < 366; dayOfYear += 1) {
        for (const hour of [1, 7, 10, 13, 16, 20, 23]) {
          const line = pickGreeting({ date: new Date(2028, 0, 1 + dayOfYear, hour), language, name, timeZone: 'Europe/Paris' });
          assert.ok(line?.text && !line.text.includes('{') && !/\s[.,]/.test(line.text) && !/^[\s,]/.test(line.text), `${language} ${dayOfYear} ${hour} "${name}": ${line?.text}`);
        }
      }
    }
  }
});

test('the greeting is escaped, and the old line is there when the words of the language are not', () => {
  const htmls = [];
  for (let hour = 5; hour < 22; hour += 1) htmls.push(greetingHtml({ language: 'en', name: '<img src=x onerror=alert(1)>', fallback: 'How can I help you?', date: at(2026, 3, 4, hour) }));
  assert.ok(htmls.every((html) => !html.includes('<img')));
  assert.ok(htmls.some((html) => html.includes('&lt;img')), 'a line with the name comes up');
  assert.equal(greetingHtml({ language: 'xx', name: 'Allen', fallback: 'How can I help you?', date: at(2026, 3, 4, 16) }), 'Allen, How can I help you?');
  assert.equal(greetingHtml({ language: 'xx', name: '<b>', fallback: 'Hi', date: at(2026, 3, 4, 16) }), '&lt;b&gt;, Hi');
});
