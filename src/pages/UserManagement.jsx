import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { User, Shield, Search, UserCheck, UserX } from 'lucide-react';

export default function UserManagement() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, assignments!assignments_user_id_fkey(count)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
