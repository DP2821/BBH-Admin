import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  Plus,
  Trash2,
  AlertTriangle,
  Calendar,
  Clock,
  User,
  Search,
  X,
  Link2,
} from 'lucide-react';

export default function Assignments() {
  const { profile } = useAuth();
  const toast = useToast();
  const [assignments, setAssignments] = useState([]);
  const [works, setWorks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({
    work_id: '',
    user_id: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [assignRes, workRes, userRes] = await Promise.all([
        supabase
          .from('assignments')
          .select('*, works(*), profiles!assignments_user_id_fkey(*), persons(*)')
          .order('assigned_at', { ascending: false }),
        supabase.from('works').select('*').eq('status', 'open').order('work_date'),
        supabase.from('profiles').select('*').order('full_name'),
      ]);

      setAssignments(assignRes.data || []);
      setWorks(workRes.data || []);
      setUsers(userRes.data || []);
    } catch (err) {
      toast.error('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(e) {
    e.preventDefault();

    if (!form.work_id || !form.user_id) {
      toast.warning('Please select both work and user');
      return;
    }

    try {
      // Check if already assigned
      const { data: existing } = await supabase
        .from('assignments')
        .select('id')
        .eq('work_id', form.work_id)
        .eq('user_id', form.user_id)
        .single();

      if (existing) {
        toast.warning('User is already assigned to this work');
        return;
      }

      // Check people_required limit
      const selectedWork = works.find((w) => w.id === form.work_id);
      if (selectedWork?.people_required) {
        const { count } = await supabase
          .from('assignments')
          .select('*', { count: 'exact', head: true })
          .eq('work_id', form.work_id);

        if (count >= selectedWork.people_required) {
          toast.warning(`This work already has ${count}/${selectedWork.people_required} people assigned`);
          return;
        }
      }

      // Check for overlaps
      const hasOverlap = await checkOverlap(form.user_id, form.work_id);

      const { error } = await supabase.from('assignments').insert({
        work_id: form.work_id,
        user_id: form.user_id,
        status: 'assigned',
        has_overlap: hasOverlap,
        assigned_by: profile.id,
      });

      if (error) throw error;

      if (hasOverlap) {
        toast.warning('Assignment created — ⚠️ Time overlap detected!');
      } else {
        toast.success('User assigned successfully');
      }

      setShowModal(false);
      setForm({ work_id: '', user_id: '' });
      fetchData();
    } catch (err) {
      toast.error('Failed to assign user');
      console.error(err);
    }
  }

  async function checkOverlap(userId, workId) {
    try {
      const selectedWork = works.find((w) => w.id === workId);
      if (!selectedWork) return false;

      // Get all assignments for this user
      const { data: userAssignments } = await supabase
        .from('assignments')
        .select('*, works(*)')
        .eq('user_id', userId)
        .neq('status', 'cancelled');

      if (!userAssignments || userAssignments.length === 0) return false;

      // Check overlap with the new work
      return userAssignments.some((a) => {
        if (!a.works || a.works.work_date !== selectedWork.work_date) return false;
        // Time overlap: start1 < end2 AND start2 < end1
        return a.works.start_time < selectedWork.end_time && selectedWork.start_time < a.works.end_time;
      });
    } catch (err) {
      console.error('Overlap check error:', err);
      return false;
    }
  }

  async function handleRemoveAssignment(assignmentId) {
    if (!confirm('Remove this assignment?')) return;

    try {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      toast.success('Assignment removed');
      fetchData();
    } catch (err) {
      toast.error('Failed to remove assignment');
      console.error(err);
    }
  }

  const filteredAssignments = assignments.filter((a) => {
    const search = searchQuery.toLowerCase();
    return (
      a.works?.title?.toLowerCase().includes(search) ||
      a.profiles?.full_name?.toLowerCase().includes(search) ||
      a.profiles?.email?.toLowerCase().includes(search) ||
      a.persons?.full_name?.toLowerCase().includes(search) ||
      a.persons?.mobile?.includes(search)
    );
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Assignments</h1>
          <p className="page-subtitle">Manage work assignments for users</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)} id="assign-work-btn">
          <Plus size={18} />
          Assign Work
        </button>
      </div>

      {/* Search */}
      <div className="filters-bar">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="input-field search-input"
            placeholder="Search by work title or user name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="search-assignments"
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredAssignments.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem' }}>
            <User size={48} />
            <h3>No assignments yet</h3>
            <p>Assign users to works to get started</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Work</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Overlap</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {a.profiles?.avatar_url ? (
                          <img src={a.profiles.avatar_url} alt="" className="avatar avatar-sm" />
                        ) : (
                          <div className="avatar-placeholder" style={{ width: 28, height: 28, fontSize: '0.7rem' }}>
                            <User size={14} />
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '0.8125rem' }}>
                            {a.profiles?.full_name || a.persons?.full_name || 'Unknown'}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                            {a.profiles?.email || (a.persons?.mobile ? `📱 ${a.persons.mobile}` : '')}
                          </div>
                          {a.persons && !a.profiles && (
                            <div style={{ fontSize: '0.625rem', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.125rem' }}>
                              <Link2 size={10} /> PDF Import (unmapped)
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {a.works?.title || 'Unknown'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Calendar size={14} style={{ color: 'var(--color-text-muted)' }} />
                        {formatDate(a.works?.work_date)}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Clock size={14} style={{ color: 'var(--color-text-muted)' }} />
                        {a.works?.start_time?.slice(0, 5)} – {a.works?.end_time?.slice(0, 5)}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${a.status === 'assigned' ? 'info' : a.status === 'completed' ? 'success' : 'danger'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      {a.has_overlap ? (
                        <span className="badge badge-overlap">
                          <AlertTriangle size={12} /> Overlap
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleRemoveAssignment(a.id)}
                        id={`remove-assignment-${a.id}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Assign Work to User</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssign}>
              <div className="form-group">
                <label className="label">Select Work *</label>
                <select
                  className="input-field"
                  value={form.work_id}
                  onChange={(e) => setForm({ ...form, work_id: e.target.value })}
                  required
                  id="assign-work-select"
                >
                  <option value="">Choose a work...</option>
                  {works.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title} — {formatDate(w.work_date)} ({w.start_time?.slice(0, 5)}-{w.end_time?.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label">Select User *</label>
                <select
                  className="input-field"
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  required
                  id="assign-user-select"
                >
                  <option value="">Choose a user...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} id="confirm-assign-btn">
                  Assign
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
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
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
