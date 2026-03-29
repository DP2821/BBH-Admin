import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  Calendar,
  Clock,
  AlertTriangle,
  Briefcase,
  CheckCircle,
} from 'lucide-react';

export default function MyWork() {
  const { profile } = useAuth();
  const toast = useToast();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (profile?.id) fetchMyWork();
  }, [profile]);

  async function fetchMyWork() {
    try {
      // Fetch assignments directly assigned to this user
      const { data: directAssignments, error: directError } = await supabase
        .from('assignments')
        .select('*, works(*)')
        .eq('user_id', profile.id)
        .order('assigned_at', { ascending: false });

      if (directError) throw directError;

      // Also fetch assignments linked via person mapping
      // (person.mapped_profile_id = current user, but user_id not yet set on assignment)
      const { data: mappedPersons } = await supabase
        .from('persons')
        .select('id')
        .eq('mapped_profile_id', profile.id);

      let personAssignments = [];
      if (mappedPersons && mappedPersons.length > 0) {
        const personIds = mappedPersons.map((p) => p.id);
        const { data: pAssignments } = await supabase
          .from('assignments')
          .select('*, works(*)')
          .in('person_id', personIds)
          .is('user_id', null)
          .order('assigned_at', { ascending: false });

        personAssignments = pAssignments || [];
      }

      // Merge and deduplicate (by assignment id)
      const allAssignments = [...(directAssignments || [])];
      const existingIds = new Set(allAssignments.map((a) => a.id));
      for (const pa of personAssignments) {
        if (!existingIds.has(pa.id)) {
          allAssignments.push(pa);
        }
      }

      setAssignments(allAssignments);
    } catch (err) {
      toast.error('Failed to load your work');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  const filteredAssignments = assignments.filter((a) => {
    if (filter === 'upcoming') return a.works?.work_date >= today;
    if (filter === 'past') return a.works?.work_date < today;
    if (filter === 'overlap') return a.has_overlap;
    return true;
  });

  const overlapCount = assignments.filter((a) => a.has_overlap).length;

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
          <h1 className="page-title">My Work</h1>
          <p className="page-subtitle">View your assigned temple works</p>
        </div>
      </div>

      {/* Overlap Alert Banner */}
      {overlapCount > 0 && (
        <div style={{
          background: 'rgba(249, 115, 22, 0.1)',
          border: '1px solid rgba(249, 115, 22, 0.3)',
          borderRadius: '10px',
          padding: '0.875rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          animation: 'fadeIn 0.3s ease',
        }}>
          <AlertTriangle size={20} style={{ color: 'var(--color-overlap)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--color-overlap)' }}>
            <strong>⚠️ {overlapCount} overlapping assignment{overlapCount > 1 ? 's' : ''} detected.</strong>{' '}
            Some of your assigned works have conflicting times. Please coordinate with the admin.
          </p>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['all', 'upcoming', 'past', ...(overlapCount > 0 ? ['overlap'] : [])].map((f) => (
          <button
            key={f}
            className={filter === f ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' && `All (${assignments.length})`}
            {f === 'upcoming' && `Upcoming`}
            {f === 'past' && `Past`}
            {f === 'overlap' && (
              <><AlertTriangle size={12} /> Overlaps ({overlapCount})</>
            )}
          </button>
        ))}
      </div>

      {/* Work Cards */}
      {filteredAssignments.length === 0 ? (
        <div className="glass-card">
          <div className="empty-state">
            <Briefcase size={48} />
            <h3>No work assigned</h3>
            <p>You don't have any work assignments yet. Submit an availability request to let the admin know you're available!</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {filteredAssignments.map((a) => {
            const isPast = a.works?.work_date < today;
            return (
              <div
                key={a.id}
                className="glass-card"
                style={{
                  opacity: isPast ? 0.6 : 1,
                  borderColor: a.has_overlap ? 'rgba(249, 115, 22, 0.4)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {a.works?.title}
                  </h3>
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    {a.has_overlap && (
                      <span className="badge badge-overlap">
                        <AlertTriangle size={12} /> Overlap
                      </span>
                    )}
                    {isPast ? (
                      <span className="badge badge-success"><CheckCircle size={12} /> Done</span>
                    ) : (
                      <span className={`badge badge-${getStatusColor(a.works?.status)}`}>
                        {a.works?.status?.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>

                {a.works?.description && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                    {a.works.description}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    <Calendar size={14} style={{ color: 'var(--color-text-muted)' }} />
                    {formatDate(a.works?.work_date)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    <Clock size={14} style={{ color: 'var(--color-text-muted)' }} />
                    {a.works?.start_time?.slice(0, 5)} – {a.works?.end_time?.slice(0, 5)}
                  </div>
                </div>

                {a.has_overlap && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(249, 115, 22, 0.08)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: 'var(--color-overlap)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                  }}>
                    <AlertTriangle size={12} />
                    This work overlaps with another assignment
                  </div>
                )}
              </div>
            );
          })}
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
