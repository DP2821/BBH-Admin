import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { User, Shield, Search, UserCheck, UserX, Link2, X } from 'lucide-react';

export default function UserManagement() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Person mapping
  const [unmappedPersons, setUnmappedPersons] = useState([]);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mappingUserId, setMappingUserId] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [personSearch, setPersonSearch] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const [usersRes, personsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*, assignments!assignments_user_id_fkey(count)')
          .order('created_at', { ascending: false }),
        supabase
          .from('persons')
          .select('id, full_name, mobile, village')
          .is('mapped_profile_id', null)
          .order('full_name'),
      ]);

      if (usersRes.error) throw usersRes.error;
      setUsers(usersRes.data || []);
      setUnmappedPersons(personsRes.data || []);
    } catch (err) {
      toast.error('Failed to load users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRole(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';

    if (!confirm(`Change this user's role to "${newRole}"?`)) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      toast.success(`Role updated to ${newRole}`);
      fetchUsers();
    } catch (err) {
      toast.error('Failed to update role');
      console.error(err);
    }
  }

  function openMapModal(userId) {
    setMappingUserId(userId);
    setSelectedPersonId('');
    setPersonSearch('');
    setShowMapModal(true);
  }

  async function handleMapPerson() {
    if (!mappingUserId || !selectedPersonId) {
      toast.warning('Please select a person to map');
      return;
    }
    try {
      const { error } = await supabase.rpc('map_person_to_profile', {
        target_person_id: selectedPersonId,
        target_profile_id: mappingUserId,
      });
      if (error) throw error;
      toast.success('Person mapped to this user! Their assignments are now linked.');
      setShowMapModal(false);
      fetchUsers();
    } catch (err) {
      toast.error('Failed to map person');
      console.error(err);
    }
  }

  const filteredPersonsForModal = unmappedPersons.filter((p) => {
    if (!personSearch) return true;
    const s = personSearch.toLowerCase();
    return (
      (p.full_name || '').toLowerCase().includes(s) ||
      (p.mobile || '').includes(s) ||
      (p.village || '').toLowerCase().includes(s)
    );
  });

  const filteredUsers = users.filter((u) => {
    const search = searchQuery.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search)
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
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">View all users and manage roles</p>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="input-field search-input"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="search-users"
          />
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredUsers.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem' }}>
            <User size={48} />
            <h3>No users found</h3>
            <p>Users will appear here after they sign in</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Assignments</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="avatar" />
                        ) : (
                          <div className="avatar-placeholder">
                            <User size={18} />
                          </div>
                        )}
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {u.full_name || 'No Name'}
                        </span>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-warning' : 'badge-info'}`}>
                        {u.role === 'admin' && <Shield size={12} />}
                        {u.role}
                      </span>
                    </td>
                    <td>{u.assignments?.[0]?.count || 0}</td>
                    <td>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                    <td>
                      <button
                        className={u.role === 'admin' ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                        onClick={() => toggleRole(u.id, u.role)}
                        id={`toggle-role-${u.id}`}
                      >
                        {u.role === 'admin' ? (
                          <><UserX size={14} /> Demote</>
                        ) : (
                          <><UserCheck size={14} /> Make Admin</>
                        )}
                      </button>
                      {unmappedPersons.length > 0 && (
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openMapModal(u.id)}
                          title="Map a person to this user"
                          id={`map-person-to-${u.id}`}
                          style={{ marginLeft: '0.375rem' }}
                        >
                          <Link2 size={14} /> Map Person
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Map Person Modal */}
      {showMapModal && (
        <div className="modal-overlay" onClick={() => setShowMapModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Map Person to User</h2>
              <button onClick={() => setShowMapModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{
              background: 'rgba(139, 92, 246, 0.05)',
              border: '1px solid rgba(139, 92, 246, 0.1)',
              borderRadius: '10px',
              padding: '0.875rem 1rem',
              marginBottom: '1.25rem',
            }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                Mapping to user:
              </p>
              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {users.find(u => u.id === mappingUserId)?.full_name || 'Unknown'} — {users.find(u => u.id === mappingUserId)?.email}
              </p>
            </div>

            <div className="form-group">
              <label className="label">Search & Select Person *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Search by name, mobile, or village..."
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                style={{ marginBottom: '0.5rem' }}
                id="map-person-search"
              />
              <select
                className="input-field"
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                size={5}
                style={{ minHeight: '150px' }}
                id="map-person-select"
              >
                {filteredPersonsForModal.length === 0 ? (
                  <option disabled>No unmapped persons found</option>
                ) : (
                  filteredPersonsForModal.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}{p.mobile ? ` • ${p.mobile}` : ''}{p.village ? ` • ${p.village}` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              This will link the selected person&apos;s assignments (imported from PDF) to this user account.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={handleMapPerson}
                disabled={!selectedPersonId}
                id="confirm-map-person-btn"
              >
                <Link2 size={16} />
                Confirm Mapping
              </button>
              <button className="btn-secondary" onClick={() => setShowMapModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
