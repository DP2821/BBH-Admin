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
function groupIntoRows(items, yTolerance = 3) {
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
  // Convert Gujarati numerals first
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
  // Match dd/mm/yyyy pattern
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

  // Process all pages
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const items = pages[pageIdx];
    if (!items || items.length === 0) continue;

    const rows = groupIntoRows(items);
    if (rows.length === 0) continue;

    let phase = 'title'; // title -> main_persons -> date_line -> table_header -> volunteers
    let mainPersonHeaderSeen = false;

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const rowText = row.map((item) => item.str.trim()).filter(Boolean).join(' ');
      const rowParts = row.map((item) => item.str.trim()).filter(Boolean);

      if (!rowText) continue;

      // ── Phase: Parse work title (first meaningful row) ──
      if (phase === 'title' && !result.workTitle) {
        // The title is usually the first row with substantial Gujarati text
        // Skip if it looks like a date line or header
        if (!rowText.includes('કામગીરી') && !rowText.includes('ક્રમ') && !rowText.includes('મુખ્ય')) {
          result.workTitle = rowText;
          phase = 'main_persons';
          continue;
        }
      }

      // ── Phase: Main persons section ──
      if (phase === 'main_persons') {
        // Detect the "મુખ્ય જવાબદાર" header
        if (rowText.includes('મુખ્ય') && rowText.includes('જવાબદાર')) {
          mainPersonHeaderSeen = true;
          // The same row or the right side may contain a name + mobile
          // Check if there's a mobile number in this row
          const mobile = extractMobile(rowText);
          if (mobile && mobile.length === 10) {
            // Extract name (everything that's not the header text and not the number)
            const nameParts = rowParts.filter(
              (p) =>
                !p.includes('મુખ્ય') &&
                !p.includes('જવાબદાર') &&
                !p.includes('વ્યક્તિ') &&
                !p.includes('નામ') &&
                !p.includes(':') &&
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

        // After header, subsequent rows with mobile numbers are main persons
        if (mainPersonHeaderSeen) {
          // Check if this is the date line (transition to next phase)
          if (rowText.includes('કામગીરી') || extractDate(rowText)) {
            phase = 'date_line';
            // Fall through to process date
          } else if (rowText.includes('ક્રમ') || rowText.includes('સ્વયંસેવક')) {
            phase = 'table_header';
            continue;
          } else {
            // Try to extract name + mobile
            const mobile = extractMobile(rowText);
            const nameParts = rowParts.filter(
              (p) => !/^\d+$/.test(gujaratiToArabic(p)) && !p.includes(':')
            );
            const name = nameParts.join(' ').trim();
            if (name) {
              result.mainPersons.push({
                name: name,
                mobile: mobile,
              });
            }
            continue;
          }
        }
      }

      // ── Phase: Date line ──
      if (phase === 'date_line' || (phase === 'main_persons' && (rowText.includes('કામગીરી') || extractDate(rowText)))) {
        const date = extractDate(rowText);
        if (date) {
          result.date = date;
        }

        const timeSlot = detectTimeSlot(rowText);
        if (timeSlot) {
          result.timeSlot = timeSlot;
        }

        // Store the full description
        result.description = rowText;

        // If no date/time found, store as description and warn
        if (!date && !timeSlot) {
          result.parseWarnings.push(
            `Could not extract date/time from line: "${rowText}". Admin should fill this in.`
          );
        }

        phase = 'table_header';
        continue;
      }

      // ── Phase: Table header ──
      if (phase === 'table_header') {
        if (rowText.includes('ક્રમ') || rowText.includes('સ્વયંસેવક') || rowText.includes('નામ')) {
          phase = 'volunteers';
          continue;
        }
        // If no clear header, check if this looks like a volunteer row
        const firstPart = gujaratiToArabic(rowParts[0] || '');
        if (/^\d+$/.test(firstPart)) {
          phase = 'volunteers';
          // Fall through to process this as a volunteer
        } else {
          // Unknown line between date and table - store as additional info
          if (rowText.trim()) {
            result.description += ' | ' + rowText;
          }
          continue;
        }
      }

      // ── Phase: Support volunteers ──
      if (phase === 'volunteers') {
        // Skip empty-looking rows
        if (!rowText.trim()) continue;

        // Parse volunteer row: serial, name, village, mobile, remarks
        const serial = gujaratiToArabic(rowParts[0] || '');

        // If first part is a number, it's a serial
        if (/^\d+$/.test(serial)) {
          const name = rowParts[1] || '';
          const village = rowParts[2] || '';
          const mobile = rowParts.length > 3 ? extractMobile(rowParts.slice(3).join(' ')) : '';
          const remarks = rowParts.length > 4 ? rowParts.slice(4).join(' ') : '';

          if (name) {
            result.supportVolunteers.push({
              name: name.trim(),
              village: village.trim(),
              mobile: mobile,
              remarks: remarks.trim(),
            });
          }
        } else {
          // Row without serial number - might be continuation or notes
          // Try to treat it as a volunteer anyway
          const name = rowParts[0] || '';
          const village = rowParts[1] || '';
          const mobile = rowParts.length > 2 ? extractMobile(rowParts.slice(2).join(' ')) : '';

          if (name && !name.includes('ક્રમ') && !name.includes('રીમાર્ક્સ')) {
            result.supportVolunteers.push({
              name: name.trim(),
              village: village.trim(),
              mobile: mobile,
              remarks: '',
            });
          }
        }
      }
    }
  }

  // Validation warnings
  if (!result.workTitle) {
    result.parseWarnings.push('Could not detect work title. Please enter it manually.');
  }
  if (!result.date) {
    result.parseWarnings.push('Could not detect date. Admin should set this manually.');
  }
  if (!result.timeSlot) {
    result.parseWarnings.push('Could not detect time slot (morning/evening). Admin should set this manually.');
  }
  if (result.mainPersons.length === 0 && result.supportVolunteers.length === 0) {
    result.parseWarnings.push('No persons were detected. Please verify the PDF format.');
  }

  return result;
}
