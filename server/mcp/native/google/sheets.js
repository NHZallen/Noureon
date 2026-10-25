// Google Sheets (https://developers.google.com/sheets/api/reference/rest): the sheets of a spreadsheet, reading and writing cells, making a spreadsheet.

import { ToolFailure } from '../api.js';
import { boolArg, fit, idArg, idPart, listArg, rowsArg, textArg } from '../inputs.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

const link = (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
const rangeArg = (args) => textArg(args, 'range', { required: true, max: 200 });
// A formula or "=" typed by the person is meant (USER_ENTERED, as when typing into the sheet); `raw` keeps every cell as the text it is.
const inputOption = (args) => (boolArg(args, 'raw') ? 'RAW' : 'USER_ENTERED');
const valuesSchema = { type: 'array', items: { type: 'array', items: {} }, description: 'Rows of cells: [["Name","Qty"],["Apple",3]]. A text that starts with = is a formula.' };

export const sheetsTools = [
  {
    name: 'sheets_get_spreadsheet',
    description: 'Get the title of a spreadsheet and its sheets (name, id, rows and columns). Use it to learn the names of the sheets before reading cells.',
    inputSchema: { type: 'object', properties: { spreadsheet_id: { type: 'string', description: 'The id in the address of the spreadsheet: docs.google.com/spreadsheets/d/<id>/edit' } }, required: ['spreadsheet_id'] },
    async run(args, call) {
      const id = idArg(args, 'spreadsheet_id');
      const data = await call('GET', `${BASE}/${idPart(id)}`, { query: { fields: 'spreadsheetId,properties(title,locale,timeZone),sheets.properties(sheetId,title,index,gridProperties(rowCount,columnCount))' } });
      return {
        id: data.spreadsheetId,
        title: data.properties?.title || '',
        time_zone: data.properties?.timeZone || '',
        link: link(data.spreadsheetId),
        sheets: (data.sheets || []).map((sheet) => ({ sheet_id: sheet.properties?.sheetId, title: sheet.properties?.title || '', rows: sheet.properties?.gridProperties?.rowCount, columns: sheet.properties?.gridProperties?.columnCount }))
      };
    }
  },
  {
    name: 'sheets_get_values',
    description: 'Read the cells of a range, as the person sees them (A1 notation, for example Sheet1!A1:D20, or just a sheet name for all of it). A long range is cut: ask for a smaller one.',
    inputSchema: { type: 'object', properties: { spreadsheet_id: { type: 'string' }, range: { type: 'string', description: 'For example Sheet1!A1:D20.' }, formulas: { type: 'boolean', description: 'Give the formulas instead of their results.' } }, required: ['spreadsheet_id', 'range'] },
    async run(args, call) {
      const data = await call('GET', `${BASE}/${idPart(idArg(args, 'spreadsheet_id'))}/values/${idPart(rangeArg(args))}`, { query: { valueRenderOption: boolArg(args, 'formulas') ? 'FORMULA' : 'FORMATTED_VALUE' } });
      return fit({ range: data?.range || '', values: data?.values || [] });
    }
  },
  {
    name: 'sheets_update_values',
    description: 'Write cells from the top left of a range (what is there is replaced).',
    inputSchema: { type: 'object', properties: { spreadsheet_id: { type: 'string' }, range: { type: 'string' }, values: valuesSchema, raw: { type: 'boolean', description: 'Keep every cell as the text it is (no formulas, no dates).' } }, required: ['spreadsheet_id', 'range', 'values'] },
    async run(args, call) {
      const data = await call('PUT', `${BASE}/${idPart(idArg(args, 'spreadsheet_id'))}/values/${idPart(rangeArg(args))}`, { query: { valueInputOption: inputOption(args) }, json: { values: rowsArg(args, 'values') } });
      return { updated_range: data?.updatedRange || '', updated_cells: data?.updatedCells || 0 };
    }
  },
  {
    name: 'sheets_append_values',
    description: 'Add rows after the last row of the table found in a range (for example Sheet1!A:D).',
    inputSchema: { type: 'object', properties: { spreadsheet_id: { type: 'string' }, range: { type: 'string' }, values: valuesSchema, raw: { type: 'boolean' } }, required: ['spreadsheet_id', 'range', 'values'] },
    async run(args, call) {
      const data = await call('POST', `${BASE}/${idPart(idArg(args, 'spreadsheet_id'))}/values/${idPart(rangeArg(args))}:append`, { query: { valueInputOption: inputOption(args), insertDataOption: 'INSERT_ROWS' }, json: { values: rowsArg(args, 'values') } });
      return { updated_range: data?.updates?.updatedRange || '', updated_rows: data?.updates?.updatedRows || 0 };
    }
  },
  {
    name: 'sheets_clear_values',
    description: 'Empty the cells of a range (their formatting stays).',
    inputSchema: { type: 'object', properties: { spreadsheet_id: { type: 'string' }, range: { type: 'string' } }, required: ['spreadsheet_id', 'range'] },
    async run(args, call) {
      const data = await call('POST', `${BASE}/${idPart(idArg(args, 'spreadsheet_id'))}/values/${idPart(rangeArg(args))}:clear`, { json: {} });
      return { cleared_range: data?.clearedRange || '' };
    }
  },
  {
    name: 'sheets_add_sheet',
    description: 'Add a new sheet (a tab) to a spreadsheet.',
    inputSchema: { type: 'object', properties: { spreadsheet_id: { type: 'string' }, title: { type: 'string' } }, required: ['spreadsheet_id', 'title'] },
    async run(args, call) {
      const data = await call('POST', `${BASE}/${idPart(idArg(args, 'spreadsheet_id'))}:batchUpdate`, { json: { requests: [{ addSheet: { properties: { title: textArg(args, 'title', { required: true, max: 100 }) } } }] } });
      const added = data?.replies?.[0]?.addSheet?.properties;
      if (!added) throw new ToolFailure('The sheet was not added.');
      return { sheet_id: added.sheetId, title: added.title };
    }
  },
  {
    name: 'sheets_create_spreadsheet',
    description: 'Create a new spreadsheet in the user\'s Drive, with the given sheets (one called Sheet1 when none is named).',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, sheet_titles: { type: 'array', items: { type: 'string' } } }, required: ['title'] },
    async run(args, call) {
      const titles = listArg(args, 'sheet_titles', { limit: 20, max: 100 });
      const data = await call('POST', BASE, { json: { properties: { title: textArg(args, 'title', { required: true, max: 200 }) }, ...(titles.length ? { sheets: titles.map((title) => ({ properties: { title } })) } : {}) } });
      return { id: data.spreadsheetId, title: data.properties?.title || '', link: data.spreadsheetUrl || link(data.spreadsheetId) };
    }
  }
];
