import * as XLSX from 'xlsx';

// ── Helpers ──

function gujaratiToArabic(str) {
  if (!str) return '';
  const s = String(str);
  const gujaratiDigits = '૦૧૨૩૪૫૬૭૮૯';
  return s.replace(/[૦-૯]/g, (d) => gujaratiDigits.indexOf(d).toString());
}

function extractMobile(str) {
  if (!str) return '';
  const converted = gujaratiToArabic(String(str));
  const match = converted.match(/(?:\+?91)?(\d{10})/);
  return match ? match[1] : converted.replace(/\D/g, '').slice(-10) || '';
}

function extractDate(str) {
  if (!str) return null;
  const converted = gujaratiToArabic(String(str));
  const match = converted.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

function detectTimeSlot(str) {
  if (!str) return null;
  const hasMorning = str.includes('સવાર') || str.includes('morning');
  const hasEvening = str.includes('સાંજ') || str.includes('evening');
  if (hasMorning && hasEvening) return 'morning_evening';
  if (hasMorning) return 'morning';
  if (hasEvening) return 'evening';
  return null;
}

/** Trim a cell value to a string */
function cell(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/** Check if an entire row is empty */
function isEmptyRow(row) {
  if (!row) return true;
  return row.every((c) => !cell(c));
}

/** Combine all non-empty cell text in a row */
function rowText(row) {
  if (!row) return '';
  return row.map((c) => cell(c)).filter(Boolean).join(' ');
}

// ── Row-type detectors ──

function isTitleRow(row) {
  const txt = rowText(row);
  if (!txt || txt.length < 4) return false;
  // Title rows usually contain "કમિટી" or "વ્યવસ્થા"
  // AND are NOT known sub-headers
  if (/કમિટી|વ્યવસ્થા/.test(txt) && !/ક્રમ|સ્વયંસેવક/.test(txt) && !/કામગીરી/.test(txt)) {
    // Extra check: don't match "મુખ્ય જવાબદાર" rows
    if (/મુખ્ય.*જવાબદાર/.test(txt)) return false;
    return true;
  }
  return false;
}

function isMainPersonHeader(row) {
  return /મુખ્ય.*જવાબદાર/.test(rowText(row));
}

function isDateLine(row) {
  const txt = rowText(row);
  return /કામગીરી/.test(txt) || (/તા\./.test(txt) && extractDate(txt));
}

function isTableHeader(row) {
  const txt = rowText(row);
  return /ક્રમ/.test(txt) && /નામ|ગામ|નંબર/.test(txt);
}

// ── Main parser ──

/**
 * Parse an Excel file and extract all committee blocks from all sheets.
 * Returns an array of block objects.
 */
export async function parseExcelFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

  const allBlocks = [];

  for (const sheetName of workbook.SheetNames) {
    // Skip a sheet called "all" — it's typically a merged summary
    if (sheetName.toLowerCase() === 'all') {
      console.log(`[Excel Parser] Skipping sheet "all" (summary sheet)`);
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    console.log(`[Excel Parser] Sheet "${sheetName}": ${rows.length} rows`);

    const blocks = parseSheetBlocks(rows, sheetName);
    allBlocks.push(...blocks);
  }

  console.log(`[Excel Parser] Total blocks found: ${allBlocks.length}`, allBlocks);
  return allBlocks;
}

/**
 * Parse a single sheet into one or more committee blocks.
 * Handles the edge case of multiple blocks stacked vertically.
 */
function parseSheetBlocks(rows, sheetName) {
  const blocks = [];

  // Find all title row indices to split blocks
  const titleIndices = [];
  for (let i = 0; i < rows.length; i++) {
    if (!isEmptyRow(rows[i]) && isTitleRow(rows[i])) {
      titleIndices.push(i);
    }
  }

  console.log(
    `[Excel Parser]   Found ${titleIndices.length} title rows in "${sheetName}" at:`,
    titleIndices
  );

  if (titleIndices.length === 0) {
    // No clear title found — treat the whole sheet as one block
    const block = parseOneBlock(rows, 0, rows.length, sheetName);
    if (block) blocks.push(block);
  } else {
    for (let t = 0; t < titleIndices.length; t++) {
      const start = titleIndices[t];
      const end = t + 1 < titleIndices.length ? titleIndices[t + 1] : rows.length;
      const block = parseOneBlock(rows, start, end, sheetName);
      if (block) blocks.push(block);
    }
  }

  return blocks;
}

/**
 * Parse a single block from `rows[startRow]` up to (excluding) `rows[endRow]`.
 */
function parseOneBlock(rows, startRow, endRow, sheetName) {
  const result = {
    workTitle: '',
    sheetName,
    date: null,
    timeSlot: null,
    description: '',
    mainPersons: [],
    supportVolunteers: [],
    parseWarnings: [],
  };

  let i = startRow;

  // ── Step 1: Title ──
  if (i < endRow && !isEmptyRow(rows[i]) && isTitleRow(rows[i])) {
    result.workTitle = rowText(rows[i]);
    i++;
  } else if (i < endRow && !isEmptyRow(rows[i])) {
    // First non-empty text that isn't a known header — use as title
    const txt = rowText(rows[i]);
    if (txt && !/ક્રમ|મુખ્ય.*જવાબદાર|કામગીરી|સ્વયંસેવક/.test(txt)) {
      result.workTitle = txt;
      i++;
    }
  }

  // ── Step 2: Scan for main persons, date line, table header ──
  let foundTableHeader = false;

  while (i < endRow && !foundTableHeader) {
    if (isEmptyRow(rows[i])) {
      i++;
      continue;
    }

    const row = rows[i];
    const txt = rowText(row);

    // Main person header row ("મુખ્ય જવાબદાર વ્યક્તિનું નામ :")
    if (isMainPersonHeader(row)) {
      // Check right-side columns for a name + mobile in the same row
      const nameVal = cell(row[2]) || cell(row[3]);
      const mobileVal = cell(row[4]) || cell(row[3]);
      if (nameVal && nameVal.length > 2 && !/જવાબદાર|મુખ્ય|વ્યક્તિ|નામ/.test(nameVal)) {
        result.mainPersons.push({
          name: nameVal,
          mobile: extractMobile(mobileVal),
        });
      }

      i++;

      // Subsequent rows may have more main persons
      while (i < endRow) {
        if (isEmptyRow(rows[i])) {
          i++;
          continue;
        }
        if (isDateLine(rows[i]) || isTableHeader(rows[i]) || isTitleRow(rows[i])) break;

        const mRow = rows[i];
        // Main person rows often have name in col B/C and mobile in col D/E
        // Column A is typically empty for these rows
        const colA = cell(mRow[0]);
        const name = cell(mRow[1]) || cell(mRow[2]);
        const mobile = cell(mRow[3]) || cell(mRow[4]);

        if (
          name &&
          name.length > 2 &&
          !/ક્રમ|સ્વયંસેવક|મુખ્ય|કામગીરી/.test(name) &&
          !/^\d+$/.test(gujaratiToArabic(colA))
        ) {
          result.mainPersons.push({
            name,
            mobile: extractMobile(mobile),
          });
        }
        i++;
      }
      continue;
    }

    // Date/description line
    if (isDateLine(row)) {
      const date = extractDate(txt);
      if (date) result.date = date;
      result.timeSlot = detectTimeSlot(txt);
      result.description += (result.description ? ' | ' : '') + txt;
      i++;
      continue;
    }

    // Table header → volunteers start next
    if (isTableHeader(row)) {
      foundTableHeader = true;
      i++;
      continue;
    }

    // Unknown row between title and table header —
    // Could be main person names (without the header label)
    // or a description line like "3વે પાર્કિંગ"
    const colA = cell(row[0]);
    const colB = cell(row[1]);
    const colC = cell(row[2]);

    // If column A is empty and column B has a name-like string → main person
    if (
      !colA &&
      colB &&
      colB.length > 3 &&
      !/ક્રમ|કામગીરી|સ્વયંસેવક/.test(colB)
    ) {
      const mobile = cell(row[3]) || cell(row[4]);
      result.mainPersons.push({
        name: colB,
        mobile: extractMobile(mobile),
      });
    } else if (txt && txt.length > 2) {
      // Treat as description
      result.description += (result.description ? ' | ' : '') + txt;
    }

    i++;
  }

  // ── Step 3: Volunteer rows ──
  while (i < endRow) {
    if (isEmptyRow(rows[i])) {
      // Look ahead: if only empty rows remain, stop
      let lookAhead = i + 1;
      while (lookAhead < endRow && isEmptyRow(rows[lookAhead])) lookAhead++;
      if (lookAhead >= endRow) break;
      // If next non-empty row is a title, stop (shouldn't happen within endRow bounds, but safety)
      if (isTitleRow(rows[lookAhead])) break;
      i++;
      continue;
    }

    // Safety: if we hit another title (shouldn't happen), stop
    if (isTitleRow(rows[i])) break;

    const row = rows[i];
    const serial = gujaratiToArabic(cell(row[0]));
    const name = cell(row[1]);
    const village = cell(row[2]);
    const mobile = cell(row[3]);
    const remarks = cell(row[4]);

    if (name && name.length > 1 && !/સ્વયંસેવક|ક્રમ|રીમાર્ક/.test(name)) {
      result.supportVolunteers.push({
        name,
        village,
        mobile: extractMobile(mobile),
        remarks,
      });
    }

    i++;
  }

  // ── Warnings ──
  if (!result.workTitle) result.parseWarnings.push('Could not detect work/committee title.');
  if (!result.date) result.parseWarnings.push('Could not detect date. Please set manually.');
  if (!result.timeSlot)
    result.parseWarnings.push('Could not detect time slot (morning/evening).');
  if (result.mainPersons.length === 0 && result.supportVolunteers.length === 0) {
    result.parseWarnings.push('No persons detected in this block.');
  }

  // Skip truly empty blocks
  if (
    !result.workTitle &&
    result.mainPersons.length === 0 &&
    result.supportVolunteers.length === 0
  ) {
    return null;
  }

  console.log(
    `[Excel Parser]   Block: "${result.workTitle}" → ${result.mainPersons.length} main, ${result.supportVolunteers.length} volunteers`
  );
  return result;
}

export { extractDate, detectTimeSlot, extractMobile, gujaratiToArabic };
