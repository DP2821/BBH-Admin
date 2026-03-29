import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { extractTextFromPdf, parseCommitteeData, timeSlotToTimes } from '../lib/pdfParser';
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  X,
  Star,
  Users,
  Calendar,
  Clock,
  History,
  Trash2,
} from 'lucide-react';
import './PdfImport.css';

export default function PdfImport() {
  const { profile } = useAuth();
  const toast = useToast();

  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importHistory, setImportHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Editable fields for admin override
  const [editableData, setEditableData] = useState(null);

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
    if (file.type !== 'application/pdf') {
      toast.warning('Please upload a PDF file');
      return;
    }

    setFileName(file.name);
    setParsing(true);
    setParsedData(null);
    setEditableData(null);

    try {
      const pages = await extractTextFromPdf(file);
      const result = parseCommitteeData(pages);

      setParsedData(result);

      // Create editable copy with times
      const times = timeSlotToTimes(result.timeSlot);
      setEditableData({
        workTitle: result.workTitle || '',
        date: result.date || '',
        timeSlot: result.timeSlot || '',
        start_time: times.start_time || '08:00',
        end_time: times.end_time || '20:00',
        description: result.description || '',
        mainPersons: result.mainPersons.map((p, i) => ({ ...p, id: `main-${i}` })),
        supportVolunteers: result.supportVolunteers.map((p, i) => ({ ...p, id: `vol-${i}` })),
      });

      if (result.parseWarnings.length > 0) {
        toast.warning(`Parsed with ${result.parseWarnings.length} warning(s). Please review.`);
      } else {
        toast.success('PDF parsed successfully! Review the data below.');
      }
    } catch (err) {
      console.error('PDF parse error:', err);
      toast.error('Failed to parse PDF. Please check the file format.');
    } finally {
      setParsing(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e);
  }

  // ── Editable field handlers ──
  function updateMainPerson(index, field, value) {
    setEditableData((prev) => ({
      ...prev,
      mainPersons: prev.mainPersons.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  }

  function removeMainPerson(index) {
    setEditableData((prev) => ({
      ...prev,
      mainPersons: prev.mainPersons.filter((_, i) => i !== index),
    }));
  }

  function updateVolunteer(index, field, value) {
    setEditableData((prev) => ({
      ...prev,
      supportVolunteers: prev.supportVolunteers.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      ),
    }));
  }

  function removeVolunteer(index) {
    setEditableData((prev) => ({
      ...prev,
      supportVolunteers: prev.supportVolunteers.filter((_, i) => i !== index),
    }));
  }

  function resetImport() {
    setParsedData(null);
    setEditableData(null);
    setFileName('');
    setImportProgress(0);
  }

  // ── Import to Database ──
  async function handleImport() {
    if (!editableData) return;

    if (!editableData.workTitle) {
      toast.warning('Please provide a work title');
      return;
    }
    if (!editableData.date) {
      toast.warning('Please provide a date');
      return;
    }

    setImporting(true);
    setImportProgress(10);

    try {
      // 1. Create the work
      const { data: work, error: workError } = await supabase
        .from('works')
        .insert({
          title: editableData.workTitle,
          description: editableData.description,
          work_date: editableData.date,
          start_time: editableData.start_time,
          end_time: editableData.end_time,
          status: 'open',
          created_by: profile.id,
        })
        .select()
        .single();

      if (workError) throw workError;
      setImportProgress(30);

      // 2. Process all persons (main + volunteers)
      const allPersons = [
        ...editableData.mainPersons.map((p) => ({ ...p, role: 'main' })),
        ...editableData.supportVolunteers.map((p) => ({ ...p, role: 'support' })),
      ];

      let personsCreated = 0;
      let assignmentsCreated = 0;

      for (let i = 0; i < allPersons.length; i++) {
        const person = allPersons[i];
        if (!person.name) continue;

        // Check if person already exists (by mobile number)
        let personId = null;

        if (person.mobile && person.mobile.length >= 10) {
          const { data: existing } = await supabase
            .from('persons')
            .select('id')
            .eq('mobile', person.mobile)
            .limit(1)
            .single();

          if (existing) {
            personId = existing.id;
          }
        }

        // Create new person if not found
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
          personsCreated++;
        }

        // Create assignment
        const { error: assignError } = await supabase.from('assignments').insert({
          work_id: work.id,
          person_id: personId,
          user_id: null,
          status: 'assigned',
          assigned_by: profile.id,
        });

        if (assignError) {
          // Might be duplicate - skip
          if (assignError.code !== '23505') {
            console.error('Failed to create assignment:', assignError);
          }
        } else {
          assignmentsCreated++;
        }

        setImportProgress(30 + Math.round((i / allPersons.length) * 60));
      }

      // 3. Record import history
      await supabase.from('pdf_imports').insert({
        file_name: fileName,
        work_title: editableData.workTitle,
        work_date: editableData.date,
        persons_imported: personsCreated,
        assignments_created: assignmentsCreated,
        imported_by: profile.id,
      });

      setImportProgress(100);
      toast.success(
        `Import complete! Work created, ${personsCreated} new persons added, ${assignmentsCreated} assignments created.`
      );

      // Refresh history and reset
      await fetchImportHistory();
      setTimeout(() => {
        resetImport();
      }, 2000);
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">PDF Import</h1>
          <p className="page-subtitle">
            Import committee data from Gujarati PDF files
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      {!parsedData && !parsing && (
        <div
          className={`pdf-import-zone glass-card ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload size={48} className="upload-icon" />
          <h3>Upload Committee PDF</h3>
          <p>Drag & drop a PDF file here, or click to browse</p>
          <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--color-text-muted)' }}>
            Supports Gujarati committee PDFs with work details, persons, and assignments
          </p>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            id="pdf-file-input"
          />
        </div>
      )}

      {/* Parsing Indicator */}
      {parsing && (
        <div className="glass-card">
          <div className="import-progress">
            <div className="spinner" />
            <p>Parsing PDF... Extracting text and analyzing structure</p>
          </div>
        </div>
      )}

      {/* Import Progress */}
      {importing && (
        <div className="glass-card">
          <div className="import-progress">
            <div className="spinner" />
            <p>Importing data to system...</p>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${importProgress}%` }} />
            </div>
            <p style={{ fontSize: '0.75rem' }}>{importProgress}% complete</p>
          </div>
        </div>
      )}

      {/* Preview Section */}
      {editableData && !importing && (
        <div className="preview-section">
          <div className="glass-card">
            <div className="preview-header">
              <h2>
                <FileText size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                Preview: {fileName}
              </h2>
              <button className="btn-secondary btn-sm" onClick={resetImport}>
                <X size={14} /> Cancel
              </button>
            </div>

            {/* Parse Warnings */}
            {parsedData?.parseWarnings?.length > 0 && (
              <div className="parse-warnings">
                <h4>
                  <AlertTriangle size={14} />
                  Parse Warnings ({parsedData.parseWarnings.length})
                </h4>
                <ul>
                  {parsedData.parseWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Editable Work Details */}
            <div className="preview-meta">
              <div className="preview-meta-item">
                <label>Work Title</label>
                <input
                  className="input-field"
                  value={editableData.workTitle}
                  onChange={(e) => setEditableData({ ...editableData, workTitle: e.target.value })}
                  placeholder="Enter work title..."
                  id="preview-work-title"
                />
              </div>
              <div className="preview-meta-item">
                <label>Date</label>
                <input
                  type="date"
                  className="input-field"
                  value={editableData.date}
                  onChange={(e) => setEditableData({ ...editableData, date: e.target.value })}
                  id="preview-work-date"
                />
              </div>
              <div className="preview-meta-item">
                <label>Time Slot</label>
                <select
                  className="input-field"
                  value={editableData.timeSlot}
                  onChange={(e) => {
                    const times = timeSlotToTimes(e.target.value);
                    setEditableData({
                      ...editableData,
                      timeSlot: e.target.value,
                      start_time: times.start_time || editableData.start_time,
                      end_time: times.end_time || editableData.end_time,
                    });
                  }}
                  id="preview-time-slot"
                >
                  <option value="">Select...</option>
                  <option value="morning">Morning (08:00 - 12:00)</option>
                  <option value="evening">Evening (16:00 - 20:00)</option>
                  <option value="morning_evening">Morning & Evening (08:00 - 20:00)</option>
                </select>
              </div>
              <div className="preview-meta-item">
                <label>Start Time</label>
                <input
                  type="time"
                  className="input-field"
                  value={editableData.start_time}
                  onChange={(e) => setEditableData({ ...editableData, start_time: e.target.value })}
                  id="preview-start-time"
                />
              </div>
              <div className="preview-meta-item">
                <label>End Time</label>
                <input
                  type="time"
                  className="input-field"
                  value={editableData.end_time}
                  onChange={(e) => setEditableData({ ...editableData, end_time: e.target.value })}
                  id="preview-end-time"
                />
              </div>
            </div>

            {/* Main Persons */}
            <div className="persons-section">
              <h3>
                <Star size={16} style={{ color: 'var(--color-warning)' }} />
                Main Responsible Persons
                <span className="badge-count">{editableData.mainPersons.length}</span>
              </h3>
              {editableData.mainPersons.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableData.mainPersons.map((p, i) => (
                        <tr key={p.id}>
                          <td>{i + 1}</td>
                          <td className="editable-cell">
                            <input
                              value={p.name}
                              onChange={(e) => updateMainPerson(i, 'name', e.target.value)}
                            />
                          </td>
                          <td className="editable-cell">
                            <input
                              value={p.mobile}
                              onChange={(e) => updateMainPerson(i, 'mobile', e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              className="btn-danger btn-sm"
                              onClick={() => removeMainPerson(i)}
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
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                  No main persons detected from PDF
                </p>
              )}
            </div>

            {/* Support Volunteers */}
            <div className="persons-section">
              <h3>
                <Users size={16} style={{ color: 'var(--color-info)' }} />
                Support Volunteers
                <span className="badge-count">{editableData.supportVolunteers.length}</span>
              </h3>
              {editableData.supportVolunteers.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Village</th>
                        <th>Mobile</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableData.supportVolunteers.map((p, i) => (
                        <tr key={p.id}>
                          <td>{i + 1}</td>
                          <td className="editable-cell">
                            <input
                              value={p.name}
                              onChange={(e) => updateVolunteer(i, 'name', e.target.value)}
                            />
                          </td>
                          <td className="editable-cell">
                            <input
                              value={p.village}
                              onChange={(e) => updateVolunteer(i, 'village', e.target.value)}
                            />
                          </td>
                          <td className="editable-cell">
                            <input
                              value={p.mobile}
                              onChange={(e) => updateVolunteer(i, 'mobile', e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              className="btn-danger btn-sm"
                              onClick={() => removeVolunteer(i)}
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
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                  No support volunteers detected from PDF
                </p>
              )}
            </div>

            {/* Import Actions */}
            <div className="import-actions">
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={handleImport}
                id="confirm-import-btn"
              >
                <CheckCircle size={18} />
                Import to System
              </button>
              <button className="btn-secondary" onClick={resetImport}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import History */}
      <div className="import-history">
        <h2>
          <History size={20} />
          Import History
        </h2>
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loadingHistory ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <div className="spinner" />
            </div>
          ) : importHistory.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <FileText size={40} />
              <h3>No imports yet</h3>
              <p>Upload your first committee PDF to get started</p>
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
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <FileText size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                          {imp.file_name}
                        </div>
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {imp.work_title || '—'}
                      </td>
                      <td>
                        {imp.work_date ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Calendar size={14} style={{ color: 'var(--color-text-muted)' }} />
                            {formatDate(imp.work_date)}
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        <span className="badge badge-info">{imp.persons_imported}</span>
                      </td>
                      <td>
                        <span className="badge badge-success">{imp.assignments_created}</span>
                      </td>
                      <td>{imp.profiles?.full_name || '—'}</td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
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
