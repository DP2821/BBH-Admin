import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  Calendar,
  Users,
  Clock,
  X,
} from 'lucide-react';
import './WorkManagement.css';

export default function WorkManagement() {
  const { profile } = useAuth();
  const toast = useToast();
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWork, setEditingWork] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [form, setForm] = useState({
    title: '',
    description: '',
    work_date: '',
    start_time: '',
    end_time: '',
    people_required: 0,
    status: 'open',
  });

  useEffect(() => {
    fetchWorks();
  }, []);

  async function fetchWorks() {
    try {
      const { data, error } = await supabase
        .from('works')
        .select('*, assignments(count)')
        .order('work_date', { ascending: false });

      if (error) throw error;
      setWorks(data || []);
    } catch (err) {
      toast.error('Failed to load works');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingWork(null);
    setForm({
      title: '',
      description: '',
      work_date: '',
      start_time: '',
      end_time: '',
      people_required: 0,
      status: 'open',
    });
    setShowModal(true);
  }

  function openEditModal(work) {
    setEditingWork(work);
    setForm({
      title: work.title,
      description: work.description || '',
      work_date: work.work_date,
      start_time: work.start_time?.slice(0, 5) || '',
      end_time: work.end_time?.slice(0, 5) || '',
      people_required: work.people_required || 0,
      status: work.status,
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.title || !form.work_date || !form.start_time || !form.end_time) {
      toast.warning('Please fill all required fields');
      return;
    }

    try {
      if (editingWork) {
        const { error } = await supabase
          .from('works')
          .update({
            title: form.title,
            description: form.description,
            work_date: form.work_date,
            start_time: form.start_time,
            end_time: form.end_time,
            people_required: form.people_required || null,
            status: form.status,
          })
          .eq('id', editingWork.id);

        if (error) throw error;
        toast.success('Work updated successfully');
      } else {
        const { error } = await supabase
          .from('works')
          .insert({
            title: form.title,
            description: form.description,
            work_date: form.work_date,
            start_time: form.start_time,
            end_time: form.end_time,
            people_required: form.people_required || null,
            status: 'open',
            created_by: profile.id,
          });

        if (error) throw error;
        toast.success('Work created successfully');
      }

      setShowModal(false);
      fetchWorks();
    } catch (err) {
      toast.error('Failed to save work');
      console.error(err);
    }
  }

  async function handleDelete(workId) {
    if (!confirm('Are you sure you want to delete this work? This will also remove all assignments.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('works')
        .delete()
        .eq('id', workId);

      if (error) throw error;
      toast.success('Work deleted');
      fetchWorks();
    } catch (err) {
      toast.error('Failed to delete work');
      console.error(err);
    }
  }

  const filteredWorks = works.filter((w) => {
    const matchesSearch =
      w.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || w.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="work-management">
      <div className="page-header">
        <div>
          <h1 className="page-title">Work Management</h1>
          <p className="page-subtitle">Create and manage temple works</p>
        </div>
        <button className="btn-primary" onClick={openCreateModal} id="create-work-btn">
          <Plus size={18} />
          Create Work
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="input-field search-input"
            placeholder="Search works..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="search-works"
          />
        </div>
        <select
          className="input-field filter-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          id="filter-status"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Works List */}
      {filteredWorks.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <Calendar size={48} />
            <h3>No works found</h3>
            <p>Create your first work to get started</p>
          </div>
        </div>
      ) : (
        <div className="works-grid">
          {filteredWorks.map((work) => (
            <div key={work.id} className="work-card glass-card">
              <div className="work-card-header">
                <h3 className="work-title">{work.title}</h3>
                <span className={`badge badge-${getStatusColor(work.status)}`}>
                  {work.status.replace('_', ' ')}
                </span>
              </div>

              {work.description && (
                <p className="work-desc">{work.description}</p>
              )}

              <div className="work-meta">
                <div className="meta-item">
                  <Calendar size={14} />
                  <span>{formatDate(work.work_date)}</span>
                </div>
                <div className="meta-item">
                  <Clock size={14} />
                  <span>{work.start_time?.slice(0, 5)} – {work.end_time?.slice(0, 5)}</span>
                </div>
                <div className="meta-item">
                  <Users size={14} />
                  <span>
                    {work.assignments?.[0]?.count || 0}
                    {work.people_required ? ` / ${work.people_required}` : ''} assigned
                  </span>
                </div>
              </div>

              <div className="work-actions">
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => openEditModal(work)}
                  id={`edit-work-${work.id}`}
                >
                  <Edit3 size={14} />
                  Edit
                </button>
                <button
                  className="btn-danger btn-sm"
                  onClick={() => handleDelete(work.id)}
                  id={`delete-work-${work.id}`}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                {editingWork ? 'Edit Work' : 'Create New Work'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="label">Title *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., Morning Aarti, Prasad Distribution"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  id="work-title-input"
                />
              </div>

              <div className="form-group">
                <label className="label">Description</label>
                <textarea
                  className="input-field"
                  placeholder="Describe the work details..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  id="work-desc-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="label">Date *</label>
                  <input
                    type="date"
                    className="input-field"
                    value={form.work_date}
                    onChange={(e) => setForm({ ...form, work_date: e.target.value })}
                    required
                    id="work-date-input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">People Required</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="0 = unlimited"
                    min="0"
                    value={form.people_required}
                    onChange={(e) => setForm({ ...form, people_required: parseInt(e.target.value) || 0 })}
                    id="work-people-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="label">Start Time *</label>
                  <input
                    type="time"
                    className="input-field"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    required
                    id="work-start-input"
                  />
                </div>
                <div className="form-group">
                  <label className="label">End Time *</label>
                  <input
                    type="time"
                    className="input-field"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    required
                    id="work-end-input"
                  />
                </div>
              </div>

              {editingWork && (
                <div className="form-group">
                  <label className="label">Status</label>
                  <select
                    className="input-field"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    id="work-status-input"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} id="save-work-btn">
                  {editingWork ? 'Update Work' : 'Create Work'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusColor(status) {
  switch (status) {
    case 'open': return 'info';
    case 'in_progress': return 'warning';
    case 'completed': return 'success';
    case 'cancelled': return 'danger';
    default: return 'info';
  }
}
