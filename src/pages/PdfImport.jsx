import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { parseExcelFile } from '../lib/excelParser';
import { timeSlotToTimes } from '../lib/pdfParser';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  X,
  Star,
  Users,
  Calendar,
  History,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  Square,
  CheckSquare,
  Layers,
} from 'lucide-react';
import './PdfImport.css';

export default function PdfImport() {
  const { profile } = useAuth();
  const toast = useToast();

  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importHistory, setImportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Multi-block state for Excel
  const [blocks, setBlocks] = useState([]); // array of editable block objects
  const [selectedBlocks, setSelectedBlocks] = useState(new Set()); // indices
  const [expandedBlock, setExpandedBlock] = useState(-1); // index of expanded block

  useEffect(() => {
    fetchImportHistory();
  }, []);

  async function fetchImportHistory() {
    try {
      const { data, error } = await supabase
        .from('pdf_imports')
        .select('*, profiles!pdf_imports_imported_by_fkey(full_name)')
        .order('imported_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setImportHistory(data || []);
    } catch (err) {
      console.error('Failed to load import history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    const isExcel = ['xls', 'xlsx'].includes(ext);
    const isPdf = ext === 'pdf';

    if (!isExcel && !isPdf) {
      toast.warning('Please upload an Excel (.xls, .xlsx) or PDF file');
      return;
    }

    setFileName(file.name);
    setParsing(true);
    setBlocks([]);
    setSelectedBlocks(new Set());
    setExpandedBlock(-1);

    try {
      if (isExcel) {
        const parsed = await parseExcelFile(file);

        if (!parsed || parsed.length === 0) {
          toast.warning('No committee data found in this file.');
          setParsing(false);
          return;
        }

        // Convert to editable blocks
        const editable = parsed.map((block, idx) => {
          const times = timeSlotToTimes(block.timeSlot);
          return {
            _id: idx,
            workTitle: block.workTitle || '',
            sheetName: block.sheetName || '',
            date: block.date || '',
            timeSlot: block.timeSlot || '',
            start_time: times.start_time || '08:00',
            end_time: times.end_time || '20:00',
            description: block.description || '',
            mainPersons: block.mainPersons.map((p, i) => ({
              ...p,
              id: `main-${idx}-${i}`,
            })),
            supportVolunteers: block.supportVolunteers.map((p, i) => ({
              ...p,
              id: `vol-${idx}-${i}`,
            })),
            parseWarnings: block.parseWarnings || [],
          };
        });

        setBlocks(editable);
        // Select all blocks by default
        setSelectedBlocks(new Set(editable.map((_, i) => i)));

        const totalWarnings = editable.reduce((s, b) => s + b.parseWarnings.length, 0);
        const totalPersons = editable.reduce(
          (s, b) => s + b.mainPersons.length + b.supportVolunteers.length,
          0
        );
        if (totalWarnings > 0) {
          toast.warning(
            `Found ${editable.length} committees with ${totalPersons} persons. ${totalWarnings} warning(s) — please review.`
          );
        } else {
          toast.success(
            `Found ${editable.length} committees with ${totalPersons} persons. Review below.`
          );
        }
      }
      // PDF path (legacy, kept for backwards compatibility)
      else if (isPdf) {
        const { extractTextFromPdf, parseCommitteeData } = await import('../lib/pdfParser');
        const pages = await extractTextFromPdf(file);
        const result = parseCommitteeData(pages);

        const times = timeSlotToTimes(result.timeSlot);
        const editable = [
          {
            _id: 0,
            workTitle: result.workTitle || '',
            sheetName: 'PDF',
            date: result.date || '',
            timeSlot: result.timeSlot || '',
            start_time: times.start_time || '08:00',
            end_time: times.end_time || '20:00',
            description: result.description || '',
            mainPersons: result.mainPersons.map((p, i) => ({ ...p, id: `main-0-${i}` })),
            supportVolunteers: result.supportVolunteers.map((p, i) => ({
              ...p,
              id: `vol-0-${i}`,
            })),
            parseWarnings: result.parseWarnings || [],
          },
        ];
        setBlocks(editable);
        setSelectedBlocks(new Set([0]));
        setExpandedBlock(0);

        if (result.parseWarnings.length > 0) {
          toast.warning(`Parsed with ${result.parseWarnings.length} warning(s).`);
        } else {
          toast.success('PDF parsed successfully!');
        }
      }
    } catch (err) {
      console.error('Parse error:', err);
      toast.error('Failed to parse file: ' + (err.message || 'Unknown error'));
    } finally {
      setParsing(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e);
  }

  // ── Block field handlers ──
  function updateBlock(blockIdx, updates) {
    setBlocks((prev) =>
      prev.map((b, i) => (i === blockIdx ? { ...b, ...updates } : b))
    );
  }

  function updateMainPerson(blockIdx, personIdx, field, value) {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIdx
          ? {
              ...b,
              mainPersons: b.mainPersons.map((p, j) =>
                j === personIdx ? { ...p, [field]: value } : p
              ),
            }
          : b
      )
    );
  }

  function removeMainPerson(blockIdx, personIdx) {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIdx
          ? { ...b, mainPersons: b.mainPersons.filter((_, j) => j !== personIdx) }
          : b
      )
    );
  }

  function updateVolunteer(blockIdx, personIdx, field, value) {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIdx
          ? {
              ...b,
              supportVolunteers: b.supportVolunteers.map((p, j) =>
                j === personIdx ? { ...p, [field]: value } : p
              ),
            }
          : b
      )
    );
  }

  function removeVolunteer(blockIdx, personIdx) {
    setBlocks((prev) =>
      prev.map((b, i) =>
        i === blockIdx
          ? { ...b, supportVolunteers: b.supportVolunteers.filter((_, j) => j !== personIdx) }
          : b
      )
    );
  }

  function toggleBlock(idx) {
    setSelectedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function selectAll() {
    setSelectedBlocks(new Set(blocks.map((_, i) => i)));
  }

  function deselectAll() {
    setSelectedBlocks(new Set());
  }

  function resetImport() {
    setBlocks([]);
    setSelectedBlocks(new Set());
    setExpandedBlock(-1);
    setFileName('');
    setImportProgress(0);
  }

  // ── Import selected blocks to Database ──
  async function handleImportAll() {
    const selected = blocks.filter((_, i) => selectedBlocks.has(i));
    if (selected.length === 0) {
      toast.warning('No committees selected for import');
      return;
    }

    setImporting(true);
    setImportProgress(0);

    let totalPersonsCreated = 0;
    let totalAssignmentsCreated = 0;
    let totalWorksCreated = 0;

    try {
      for (let s = 0; s < selected.length; s++) {
        const block = selected[s];
        const baseProgress = Math.round((s / selected.length) * 100);
        setImportProgress(baseProgress);

        // 1. Create the work
        const { data: work, error: workError } = await supabase
          .from('works')
          .insert({
            title: block.workTitle || `Untitled Committee ${s + 1}`,
            description: block.description,
            work_date: block.date || null,
            start_time: block.start_time,
            end_time: block.end_time,
            status: 'open',
            created_by: profile.id,
          })
          .select()
          .single();

        if (workError) {
          console.error('Failed to create work:', block.workTitle, workError);
          continue;
        }
        totalWorksCreated++;

        // 2. Process all persons
        const allPersons = [
          ...block.mainPersons.map((p) => ({ ...p, role: 'main' })),
          ...block.supportVolunteers.map((p) => ({ ...p, role: 'support' })),
        ];

        for (let i = 0; i < allPersons.length; i++) {
          const person = allPersons[i];
          if (!person.name) continue;

          let personId = null;

          // Deduplicate by mobile
          if (person.mobile && person.mobile.length >= 10) {
            const { data: existing } = await supabase
              .from('persons')
              .select('id')
              .eq('mobile', person.mobile)
              .limit(1)
              .single();

            if (existing) personId = existing.id;
          }

          if (!personId) {
            const { data: newPerson, error: personError } = await supabase
              .from('persons')
              .insert({
                full_name: person.name,
                mobile: person.mobile || null,
                village: person.village || null,
              })
              .select()
              .single();

            if (personError) {
              console.error('Failed to create person:', person.name, personError);
              continue;
            }
            personId = newPerson.id;
            totalPersonsCreated++;
          }

          const { error: assignError } = await supabase.from('assignments').insert({
            work_id: work.id,
            person_id: personId,
            user_id: null,
            status: 'assigned',
            assigned_by: profile.id,
          });

          if (!assignError) totalAssignmentsCreated++;
          else if (assignError.code !== '23505') {
            console.error('Assign error:', assignError);
          }
        }

        // Record import history for this block
        await supabase.from('pdf_imports').insert({
          file_name: fileName,
          work_title: block.workTitle || `Untitled Committee ${s + 1}`,
          work_date: block.date || null,
          persons_imported: block.mainPersons.length + block.supportVolunteers.length,
          assignments_created: allPersons.length,
          imported_by: profile.id,
        });
      }

      setImportProgress(100);
      toast.success(
        `Import complete! ${totalWorksCreated} works, ${totalPersonsCreated} new persons, ${totalAssignmentsCreated} assignments created.`
      );

      await fetchImportHistory();
      setTimeout(resetImport, 2000);
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setImporting(false);
    }
  }

  // ── Computed values ──
  const totalPersonsSelected = blocks
    .filter((_, i) => selectedBlocks.has(i))
    .reduce((s, b) => s + b.mainPersons.length + b.supportVolunteers.length, 0);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Data Import</h1>
          <p className="page-subtitle">
            Import committee data from Excel or PDF files
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      {blocks.length === 0 && !parsing && (
        <div
          className={`pdf-import-zone glass-card ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload size={48} className="upload-icon" />
          <h3>Upload Committee File</h3>
          <p>Drag & drop an Excel or PDF file here, or click to browse</p>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'center',
              marginTop: '0.75rem',
            }}
          >
            <span
              className="badge badge-success"
              style={{ fontSize: '0.6875rem' }}
            >
              <FileSpreadsheet size={12} /> .xls / .xlsx (recommended)
            </span>
            <span
              className="badge badge-info"
              style={{ fontSize: '0.6875rem' }}
            >
              <FileText size={12} /> .pdf
            </span>
          </div>
          <input
            type="file"
            accept=".xls,.xlsx,.pdf"
            onChange={handleFileSelect}
            id="file-input"
          />
        </div>
      )}

      {/* Parsing Indicator */}
      {parsing && (
        <div className="glass-card">
          <div className="import-progress">
            <div className="spinner" />
            <p>Parsing file... Extracting data from all sheets</p>
          </div>
        </div>
      )}

      {/* Import Progress */}
      {importing && (
        <div className="glass-card">
          <div className="import-progress">
            <div className="spinner" />
            <p>
              Importing {selectedBlocks.size} committees to system...
            </p>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p style={{ fontSize: '0.75rem' }}>{importProgress}% complete</p>
          </div>
        </div>
      )}

      {/* Multi-block Preview */}
      {blocks.length > 0 && !importing && (
        <div className="preview-section">
          {/* Summary bar */}
          <div className="glass-card" style={{ marginBottom: '1rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
                  <Layers size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                  {fileName}
                </h2>
                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-muted)',
                    margin: '0.25rem 0 0',
                  }}
                >
                  Found <strong>{blocks.length}</strong> committees ·{' '}
                  <strong>{selectedBlocks.size}</strong> selected ·{' '}
                  <strong>{totalPersonsSelected}</strong> persons
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-secondary btn-sm" onClick={selectAll}>
                  Select All
                </button>
                <button className="btn-secondary btn-sm" onClick={deselectAll}>
                  Deselect All
                </button>
                <button className="btn-secondary btn-sm" onClick={resetImport}>
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          </div>

          {/* Block cards */}
          {blocks.map((block, idx) => {
            const isExpanded = expandedBlock === idx;
            const isSelected = selectedBlocks.has(idx);
            const personCount =
              block.mainPersons.length + block.supportVolunteers.length;
            const hasWarnings = block.parseWarnings.length > 0;

            return (
              <div
                key={idx}
                className={`glass-card block-card ${isSelected ? 'selected' : 'deselected'}`}
                style={{ marginBottom: '0.75rem' }}
              >
                {/* Block header (always visible) */}
                <div
                  className="block-header"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer',
                  }}
                  onClick={() =>
                    setExpandedBlock(isExpanded ? -1 : idx)
                  }
                >
                  {/* Checkbox */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBlock(idx);
                    }}
                    style={{ cursor: 'pointer', flexShrink: 0, color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
                  >
                    {isSelected ? (
                      <CheckSquare size={20} />
                    ) : (
                      <Square size={20} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        fontSize: '0.9375rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {block.workTitle || 'Untitled Committee'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.75rem',
                        fontSize: '0.75rem',
                        color: 'var(--color-text-muted)',
                        marginTop: '0.25rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        📄 {block.sheetName}
                      </span>
                      <span>
                        <Star
                          size={11}
                          style={{ color: 'var(--color-warning)' }}
                        />{' '}
                        {block.mainPersons.length} main
                      </span>
                      <span>
                        <Users size={11} /> {block.supportVolunteers.length}{' '}
                        volunteers
                      </span>
                      {block.date && (
                        <span>
                          <Calendar size={11} /> {block.date}
                        </span>
                      )}
                      {hasWarnings && (
                        <span style={{ color: 'var(--color-warning)' }}>
                          <AlertTriangle size={11} />{' '}
                          {block.parseWarnings.length} warning(s)
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0 }}>
                    {isExpanded ? (
                      <ChevronDown size={18} />
                    ) : (
                      <ChevronRight size={18} />
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '1rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {/* Parse Warnings */}
                    {hasWarnings && (
                      <div className="parse-warnings" style={{ marginBottom: '1rem' }}>
                        <h4>
                          <AlertTriangle size={14} /> Warnings
                        </h4>
                        <ul>
                          {block.parseWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Editable meta */}
                    <div className="preview-meta">
                      <div className="preview-meta-item">
                        <label>Work Title</label>
                        <input
                          className="input-field"
                          value={block.workTitle}
                          onChange={(e) =>
                            updateBlock(idx, {
                              workTitle: e.target.value,
                            })
                          }
                          placeholder="Enter work title..."
                        />
                      </div>
                      <div className="preview-meta-item">
                        <label>Date</label>
                        <input
                          type="date"
                          className="input-field"
                          value={block.date}
                          onChange={(e) =>
                            updateBlock(idx, { date: e.target.value })
                          }
                        />
                      </div>
                      <div className="preview-meta-item">
                        <label>Time Slot</label>
                        <select
                          className="input-field"
                          value={block.timeSlot}
                          onChange={(e) => {
                            const times = timeSlotToTimes(e.target.value);
                            updateBlock(idx, {
                              timeSlot: e.target.value,
                              start_time:
                                times.start_time || block.start_time,
                              end_time: times.end_time || block.end_time,
                            });
                          }}
                        >
                          <option value="">Select...</option>
                          <option value="morning">
                            Morning (08:00 - 12:00)
                          </option>
                          <option value="evening">
                            Evening (16:00 - 20:00)
                          </option>
                          <option value="morning_evening">
                            Morning & Evening (08:00 - 20:00)
                          </option>
                        </select>
                      </div>
                      <div className="preview-meta-item">
                        <label>Start</label>
                        <input
                          type="time"
                          className="input-field"
                          value={block.start_time}
                          onChange={(e) =>
                            updateBlock(idx, {
                              start_time: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="preview-meta-item">
                        <label>End</label>
                        <input
                          type="time"
                          className="input-field"
                          value={block.end_time}
                          onChange={(e) =>
                            updateBlock(idx, { end_time: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    {/* Main Persons */}
                    <div className="persons-section">
                      <h3>
                        <Star
                          size={16}
                          style={{ color: 'var(--color-warning)' }}
                        />
                        Main Persons
                        <span className="badge-count">
                          {block.mainPersons.length}
                        </span>
                      </h3>
                      {block.mainPersons.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Mobile</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.mainPersons.map((p, pi) => (
                                <tr key={p.id}>
                                  <td>{pi + 1}</td>
                                  <td className="editable-cell">
                                    <input
                                      value={p.name}
                                      onChange={(e) =>
                                        updateMainPerson(
                                          idx,
                                          pi,
                                          'name',
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="editable-cell">
                                    <input
                                      value={p.mobile}
                                      onChange={(e) =>
                                        updateMainPerson(
                                          idx,
                                          pi,
                                          'mobile',
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>
                                  <td>
                                    <button
                                      className="btn-danger btn-sm"
                                      onClick={() =>
                                        removeMainPerson(idx, pi)
                                      }
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="empty-hint">
                          No main persons found
                        </p>
                      )}
                    </div>

                    {/* Support Volunteers */}
                    <div className="persons-section">
                      <h3>
                        <Users
                          size={16}
                          style={{ color: 'var(--color-info)' }}
                        />
                        Volunteers
                        <span className="badge-count">
                          {block.supportVolunteers.length}
                        </span>
                      </h3>
                      {block.supportVolunteers.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Village</th>
                                <th>Mobile</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {block.supportVolunteers.map((p, pi) => (
                                <tr key={p.id}>
                                  <td>{pi + 1}</td>
                                  <td className="editable-cell">
                                    <input
                                      value={p.name}
                                      onChange={(e) =>
                                        updateVolunteer(
                                          idx,
                                          pi,
                                          'name',
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="editable-cell">
                                    <input
                                      value={p.village}
                                      onChange={(e) =>
                                        updateVolunteer(
                                          idx,
                                          pi,
                                          'village',
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="editable-cell">
                                    <input
                                      value={p.mobile}
                                      onChange={(e) =>
                                        updateVolunteer(
                                          idx,
                                          pi,
                                          'mobile',
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>
                                  <td>
                                    <button
                                      className="btn-danger btn-sm"
                                      onClick={() =>
                                        removeVolunteer(idx, pi)
                                      }
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="empty-hint">
                          No volunteers found
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Import Actions */}
          <div className="import-actions" style={{ marginTop: '1rem' }}>
            <button
              className="btn-primary"
              style={{ flex: 1 }}
              onClick={handleImportAll}
              disabled={selectedBlocks.size === 0}
              id="confirm-import-btn"
            >
              <CheckCircle size={18} />
              Import {selectedBlocks.size} of {blocks.length} Committees
            </button>
            <button className="btn-secondary" onClick={resetImport}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Import History */}
      <div className="import-history">
        <h2>
          <History size={20} />
          Import History
        </h2>
        <div
          className="glass-card"
          style={{ padding: 0, overflow: 'hidden' }}
        >
          {loadingHistory ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '2rem',
              }}
            >
              <div className="spinner" />
            </div>
          ) : importHistory.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <FileText size={40} />
              <h3>No imports yet</h3>
              <p>Upload your first committee file to get started</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Work Title</th>
                    <th>Date</th>
                    <th>Persons</th>
                    <th>Assignments</th>
                    <th>Imported By</th>
                    <th>Imported At</th>
                  </tr>
                </thead>
                <tbody>
                  {importHistory.map((imp) => (
                    <tr key={imp.id}>
                      <td
                        style={{
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                          }}
                        >
                          <FileText
                            size={14}
                            style={{
                              color: 'var(--color-text-muted)',
                              flexShrink: 0,
                            }}
                          />
                          {imp.file_name}
                        </div>
                      </td>
                      <td
                        style={{
                          fontWeight: 500,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {imp.work_title || '—'}
                      </td>
                      <td>
                        {imp.work_date ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.375rem',
                            }}
                          >
                            <Calendar
                              size={14}
                              style={{
                                color: 'var(--color-text-muted)',
                              }}
                            />
                            {formatDate(imp.work_date)}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {imp.persons_imported}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-success">
                          {imp.assignments_created}
                        </span>
                      </td>
                      <td>{imp.profiles?.full_name || '—'}</td>
                      <td
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {new Date(imp.imported_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
