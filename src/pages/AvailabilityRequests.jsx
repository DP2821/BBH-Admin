import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  Check,
  X,
  Clock,
  Search,
  User,
  MessageSquare,
} from 'lucide-react';

export default function AvailabilityRequests() {
  const { isAdmin, profile } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchRequests();
  }, [isAdmin, profile]);

  async function fetchRequests() {
    try {
      let query = supabase
        .from('availability_requests')
        .select('*, profiles!availability_requests_user_id_fkey(*)')
        .order('created_at', { ascending: false });

      // Users only see their own
      if (!isAdmin) {
        query = query.eq('user_id', profile?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      toast.error('Failed to load requests');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(requestId, status) {
    try {
      const { error } = await supabase
        .from('availability_requests')
        .update({
          status,
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;
      toast.success(`Request ${status}`);
      fetchRequests();
    } catch (err) {
      toast.error('Failed to update request');
      console.error(err);
    }
  }

  const filteredRequests = requests.filter((r) => {
    const search = searchQuery.toLowerCase();
    return (
      r.profiles?.full_name?.toLowerCase().includes(search) ||
      r.profiles?.email?.toLowerCase().includes(search) ||
      (r.message || '').toLowerCase().includes(search)
    );
  });

  const pendingRequests = filteredRequests.filter((r) => r.status === 'pending');
  const resolvedRequests = filteredRequests.filter((r) => r.status !== 'pending');

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
          <h1 className="page-title">Availability Requests</h1>
          <p className="page-subtitle">
            {isAdmin ? 'Review volunteer availability requests' : 'Your submitted requests'}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="filters-bar">
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="input-field search-input"
              placeholder="Search by name or message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="search-requests"
            />
          </div>
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-warning)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} />
            Pending ({pendingRequests.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {pendingRequests.map((req) => (
              <div key={req.id} className="glass-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
                  {req.profiles?.avatar_url ? (
                    <img src={req.profiles.avatar_url} alt="" className="avatar" />
                  ) : (
                    <div className="avatar-placeholder">
                      <User size={18} />
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{req.profiles?.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{req.profiles?.email}</div>
                  </div>
                  <span className="badge badge-warning" style={{ marginLeft: 'auto' }}>Pending</span>
                </div>

                {req.message && (
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.625rem', background: 'var(--color-bg-dark)', borderRadius: '8px', marginBottom: '0.75rem' }}>
                    <MessageSquare size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                      {req.message}
                    </p>
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                  Submitted: {new Date(req.created_at).toLocaleString('en-IN')}
                </div>

                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn-success btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => handleReview(req.id, 'approved')}
                      id={`approve-request-${req.id}`}
                    >
                      <Check size={14} /> Approve
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => handleReview(req.id, 'rejected')}
                      id={`reject-request-${req.id}`}
                    >
                      <X size={14} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Resolved Requests */}
      {resolvedRequests.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            Resolved ({resolvedRequests.length})
          </h3>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {resolvedRequests.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {req.profiles?.avatar_url ? (
                          <img src={req.profiles.avatar_url} alt="" className="avatar avatar-sm" />
                        ) : (
                          <div className="avatar-placeholder" style={{ width: 28, height: 28 }}>
                            <User size={14} />
                          </div>
                        )}
                        <span style={{ fontWeight: 500, color: 'var(--color-text-primary)', fontSize: '0.8125rem' }}>
                          {req.profiles?.full_name || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.message || '—'}
                    </td>
                    <td>
                      <span className={`badge badge-${req.status === 'approved' ? 'success' : 'danger'}`}>
                        {req.status}
                      </span>
                    </td>
                    <td>{new Date(req.created_at).toLocaleDateString('en-IN')}</td>
                    <td>{req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString('en-IN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {filteredRequests.length === 0 && (
        <div className="glass-card">
          <div className="empty-state">
            <MessageSquare size={48} />
            <h3>No requests found</h3>
            <p>{isAdmin ? 'No availability requests submitted yet' : 'You haven\'t submitted any requests yet'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
