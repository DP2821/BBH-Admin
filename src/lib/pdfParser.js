import * as pdfjsLib from 'pdfjs-dist';

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/**
 * Extract raw text content from a PDF file.
 * Returns an array of text items with their positions per page.
 */
export async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    pages.push(textContent.items);
  }
  return pages;
}

/**
 * Group text items into rows based on Y position.
 * Items on the same line (within tolerance) are grouped together.
 */
function groupIntoRows(items, yTolerance = 5) {
  if (!items || items.length === 0) return [];

  // Sort by Y (top to bottom, PDF Y is bottom-up so we reverse)
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5]; // reverse Y
    if (Math.abs(yDiff) < yTolerance) {
      return a.transform[4] - b.transform[4]; // left to right
    }
    return yDiff;
  });

  const rows = [];
  let currentRow = [sorted[0]];
  let currentY = sorted[0].transform[5];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.transform[5] - currentY) < yTolerance) {
      currentRow.push(item);
    } else {
      // Sort current row left-to-right
      currentRow.sort((a, b) => a.transform[4] - b.transform[4]);
      rows.push(currentRow);
      currentRow = [item];
      currentY = item.transform[5];
    }
  }
  if (currentRow.length > 0) {
    currentRow.sort((a, b) => a.transform[4] - b.transform[4]);
    rows.push(currentRow);
  }
  return rows;
}

/**
 * Clean noise characters from text items.
 * Removes common table borders/pipes/underscores.
 */
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/[|│┃╽╿╻╹╺╻╼╾_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert Gujarati numerals (૦-૯) to Arabic numerals (0-9)
 */
function gujaratiToArabic(str) {
  if (!str) return str;
  const gujaratiDigits = '૦૧૨૩૪૫૬૭૮૯';
  return str.replace(/[૦-૯]/g, (d) => gujaratiDigits.indexOf(d).toString());
}

/**
 * Extract a 10-digit mobile number from a string.
 * Handles Gujarati numerals too.
 */
function extractMobile(str) {
  if (!str) return '';
  const converted = gujaratiToArabic(str);
  // Match 10-digit number (may start with +91 or 91)
  const match = converted.match(/(?:\+?91)?(\d{10})/);
  return match ? match[1] : converted.replace(/\D/g, '').slice(-10) || '';
}

/**
 * Extract date in YYYY-MM-DD format from a Gujarati date string.
 * Expected formats: "તા.23/04/2026" or "તા.૨૩/૦૪/૨૦૨૬"
 */
function extractDate(str) {
  if (!str) return null;
  const converted = gujaratiToArabic(str);
  // Match dd/mm/yyyy pattern (with various separators)
  const match = converted.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Detect time slot from text.
 * Returns: 'morning', 'evening', 'morning_evening', or null
 */
function detectTimeSlot(str) {
  if (!str) return null;

  const hasMorning = str.includes('સવાર') || str.includes('morning');
  const hasEvening = str.includes('સાંજ') || str.includes('evening');

  if (hasMorning && hasEvening) return 'morning_evening';
  if (hasMorning) return 'morning';
  if (hasEvening) return 'evening';
  return null;
}

/**
 * Get start_time and end_time from a time slot.
 */
export function timeSlotToTimes(slot) {
  switch (slot) {
    case 'morning':
      return { start_time: '08:00', end_time: '12:00' };
    case 'evening':
      return { start_time: '16:00', end_time: '20:00' };
    case 'morning_evening':
      return { start_time: '08:00', end_time: '20:00' };
    default:
      return { start_time: null, end_time: null };
  }
}

/**
 * Parse the committee PDF structure.
 *
 * Expected structure:
 *  Row 1: Work title (committee name)
 *  Row 2-N: "મુખ્ય જવાબદાર..." header + main persons (name + mobile)
 *  Row N+1: Date + time description line ("કામગીરી :- તા.23/04/2026 ...")
 *  Row N+2: Table header ("ક્રમ", "સ્વયંસેવક નું નામ", "ગામ", "મો.નંબર", "રિમાર્ક્સ")
 *  Row N+3...: Support volunteers (serial, name, village, mobile, remarks)
 */
export function parseCommitteeData(pages) {
  const result = {
    workTitle: '',
    date: null,
    timeSlot: null,
    description: '',
    mainPersons: [],
    supportVolunteers: [],
    parseWarnings: [],
  };

  console.log('[PDF Parser] Starting parse for committee PDF...');

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const items = pages[pageIdx];
    if (!items || items.length === 0) continue;

    const rows = groupIntoRows(items);
    if (rows.length === 0) continue;

    let phase = 'title'; // title -> main_persons -> date_line -> table_header -> volunteers
    let mainPersonHeaderSeen = false;

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      
      // Filter out technical items and clean the text
      const rowParts = row
        .map((item) => cleanText(item.str))
        .filter(Boolean);
      
      const rowText = rowParts.join(' ');
      if (!rowText) continue;

      console.log(`[PDF Parser] P${pageIdx+1} R${rowIdx+1}: "${rowText}" (Phase: ${phase})`);

      // ── Phase: Parse work title ──
      if (phase === 'title' && !result.workTitle) {
        // Skip common headers
        if (!/ક્રમ|કામગીરી|મુખ્ય|સ્વયંસેવક/.test(rowText)) {
          result.workTitle = rowText;
          phase = 'main_persons';
          continue;
        }
      }

      // ── Phase: Main persons section ──
      if (phase === 'main_persons') {
        const isMainHeader = /મુખ્ય.*જવાબદાર/i.test(rowText);
        
        if (isMainHeader) {
          mainPersonHeaderSeen = true;
          const mobile = extractMobile(rowText);
          if (mobile && mobile.length === 10) {
            const nameParts = rowParts.filter(
              (p) =>
                !/મુખ્ય|જવાબદાર|વ્યક્તિ|નામ|:|જવાબદાર/.test(p) &&
                !/^\d+$/.test(gujaratiToArabic(p))
            );
            if (nameParts.length > 0) {
              result.mainPersons.push({
                name: nameParts.join(' ').trim(),
                mobile: mobile,
              });
            }
          }
          continue;
        }

        if (mainPersonHeaderSeen) {
          if (/કામગીરી|તા\.|[૦-૯]{2}\/[૦-૯]{2}\//.test(rowText)) {
            phase = 'date_line';
          } else if (/ક્રમ|સ્વયંસેવક/.test(rowText)) {
            phase = 'table_header';
          } else {
            const mobile = extractMobile(rowText);
            const nameParts = rowParts.filter(
              (p) => !/^\d+$/.test(gujaratiToArabic(p)) && !p.includes(':')
            );
            const name = nameParts.join(' ').trim();
            if (name && name.length > 2) {
              result.mainPersons.push({ name, mobile });
            }
            continue;
          }
        }
      }

      // ── Phase: Date line ──
      if (phase === 'date_line' || (phase === 'main_persons' && /કામગીરી|તા\./.test(rowText))) {
        const date = extractDate(rowText);
        if (date) result.date = date;

        const timeSlot = detectTimeSlot(rowText);
        if (timeSlot) result.timeSlot = timeSlot;

        result.description += (result.description ? ' | ' : '') + rowText;
        phase = 'table_header';
        
        if (!date && !timeSlot && !rowText.includes('કામગીરી')) {
          // Skip lines that look like continuation of header
          phase = 'date_line'; 
        }
        continue;
      }

      // ── Phase: Table header ──
      if (phase === 'table_header') {
        if (/ક્રમ|સ્વયંસેવક|નામ/.test(rowText)) {
          phase = 'volunteers';
          continue;
        }
        const serial = gujaratiToArabic(rowParts[0] || '');
        if (/^\d+$/.test(serial)) {
          phase = 'volunteers';
        } else {
          if (rowText.trim()) result.description += ' | ' + rowText;
          continue;
        }
      }

      // ── Phase: Support volunteers ──
      if (phase === 'volunteers') {
        const serial = gujaratiToArabic(rowParts[0] || '');
        
        if (/^\d+$/.test(serial)) {
          const name = rowParts[1] || '';
          const village = rowParts[2] || '';
          const mobile = rowParts.length > 3 ? extractMobile(rowParts.slice(3).join(' ')) : '';
          const remarks = rowParts.length > 4 ? rowParts.slice(4).join(' ') : '';

          if (name && name.length > 2) {
            result.supportVolunteers.push({
              name: name.trim(),
              village: village.trim(),
              mobile: mobile,
              remarks: remarks.trim(),
            });
          }
        } else {
          const name = rowParts[0] || '';
          const village = rowParts[1] || '';
          const mobile = rowParts.length > 2 ? extractMobile(rowParts.slice(2).join(' ')) : '';

          if (name && name.length > 2 && !/ક્રમ|રીમાર્ક્સ/.test(name)) {
            result.supportVolunteers.push({ name, village, mobile, remarks: '' });
          }
        }
      }
    }
  }

  // Final Cleanup & Warnings
  if (!result.workTitle) result.parseWarnings.push('Could not detect work title.');
  if (!result.date) result.parseWarnings.push('Could not detect date.');
  if (!result.timeSlot) result.parseWarnings.push('Could not detect time slot (morning/evening).');
  if (result.mainPersons.length === 0 && result.supportVolunteers.length === 0) {
    result.parseWarnings.push('No persons were detected. Please verify the PDF format.');
  }

  console.log('[PDF Parser] Parse complete:', result);
  return result;
}
