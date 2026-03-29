import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import {
  User,
  Search,
  Plus,
  Edit3,
  Trash2,
  Link2,
  Unlink,
  Phone,
  MapPin,
  X,
  CheckCircle,
} from 'lucide-react';
import './PersonManagement.css';

export default function PersonManagement() {
  const toast = useToast();
  const [persons, setPersons] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMapping, setFilterMapping] = useState('all'); // all | mapped | unmapped

  // CRUD Modal
  const [showModal, setShowModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [form, setForm] = useState({
    full_name: '',
    mobile: '',
    village: '',
  });

  // Map Modal
  const [showMapModal, setShowMapModal] = useState(false);
  const [mappingPerson, setMappingPerson] = useState(null);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [profileSearch, setProfileSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [personsRes, profilesRes] = await Promise.all([
        supabase
          .from('persons')
          .select('*, profiles:mapped_profile_id(id, full_name, email, avatar_url), assignments(count)')
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').order('full_name'),
      ]);

      if (personsRes.error) throw personsRes.error;
      setPersons(personsRes.data || []);
      setProfiles(profilesRes.data || []);
    } catch (err) {
      toast.error('Failed to load persons');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ── CRUD Handlers ──
  function openCreateModal() {
    setEditingPerson(null);
    setForm({ full_name: '', mobile: '', village: '' });
    setShowModal(true);
  }

  function openEditModal(person) {
    setEditingPerson(person);
    setForm({
      full_name: person.full_name || '',
      mobile: person.mobile || '',
      village: person.village || '',
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.warning('Name is required');
      return;
    }

    try {
      if (editingPerson) {
        const { error } = await supabase
          .from('persons')
          .update({
            full_name: form.full_name.trim(),
            mobile: form.mobile.trim() || null,
            village: form.village.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPerson.id);

        if (error) throw error;
        toast.success('Person updated');
      } else {
        const { error } = await supabase.from('persons').insert({
          full_name: form.full_name.trim(),
          mobile: form.mobile.trim() || null,
          village: form.village.trim() || null,
        });

        if (error) throw error;
        toast.success('Person created');
      }

      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to save person');
      console.error(err);
    }
  }

  async function handleDelete(personId) {
    if (!confirm('Delete this person? Their assignments will also be affected.')) return;

    try {
      const { error } = await supabase.from('persons').delete().eq('id', personId);
      if (error) throw error;
      toast.success('Person deleted');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete person');
      console.error(err);
    }
  }

  // ── Mapping Handlers ──
  function openMapModal(person) {
    setMappingPerson(person);
    setSelectedProfileId('');
    setProfileSearch('');
    setShowMapModal(true);
  }

  async function handleMap() {
    if (!mappingPerson || !selectedProfileId) {
      toast.warning('Please select a user to map');
      return;
    }

    try {
      const { error } = await supabase.rpc('map_person_to_profile', {
        target_person_id: mappingPerson.id,
        target_profile_id: selectedProfileId,
      });

      if (error) throw error;
      toast.success('Person mapped to user successfully! Their assignments are now linked.');
      setShowMapModal(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to map person');
      console.error(err);
    }
  }

  async function handleUnmap(person) {
    if (!confirm('Unmap this person from their linked user? Assignments will lose the user link.')) return;

    try {
      // Remove the mapping
      const { error: unmapError } = await supabase
        .from('persons')
        .update({ mapped_profile_id: null, updated_at: new Date().toISOString() })
        .eq('id', person.id);

      if (unmapError) throw unmapError;

      // Remove user_id from assignments that were set via mapping
      const { error: assignError } = await supabase
        .from('assignments')
        .update({ user_id: null })
        .eq('person_id', person.id);

      if (assignError) throw assignError;

      toast.success('Person unmapped');
      fetchData();
    } catch (err) {
      toast.error('Failed to unmap person');
      console.error(err);
    }
  }

  // ── Filtering ──
  const filteredPersons = persons.filter((p) => {
    const search = searchQuery.toLowerCase();
    const matchesSearch =
      (p.full_name || '').toLowerCase().includes(search) ||
      (p.mobile || '').includes(search) ||
      (p.village || '').toLowerCase().includes(search);

    const matchesFilter =
      filterMapping === 'all' ||
      (filterMapping === 'mapped' && p.mapped_profile_id) ||
      (filterMapping === 'unmapped' && !p.mapped_profile_id);

    return matchesSearch && matchesFilter;
  });

  const mappedCount = persons.filter((p) => p.mapped_profile_id).length;
  const unmappedCount = persons.filter((p) => !p.mapped_profile_id).length;

  // Filter profiles for mapping modal (exclude already-mapped ones)
  const mappedProfileIds = new Set(persons.filter((p) => p.mapped_profile_id).map((p) => p.mapped_profile_id));
  const availableProfiles = profiles.filter((p) => {
    if (mappedProfileIds.has(p.id)) return false;
    if (!profileSearch) return true;
    const search = profileSearch.toLowerCase();
    return (
      (p.full_name || '').toLowerCase().includes(search) ||
      (p.email || '').toLowerCase().includes(search)
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
          <h1 className="page-title">Persons</h1>
          <p className="page-subtitle">
            Manage imported persons and map them to user accounts
          </p>
        </div>
        <button className="btn-primary" onClick={openCreateModal} id="create-person-btn">
          <Plus size={18} />
          Add Person
        </button>
      </div>

      {/* Stats */}
      <div className="persons-stats">
        <div className="person-stat">
          <div className="value">{persons.length}</div>
          <div className="label">Total Persons</div>
        </div>
        <div className="person-stat">
          <div className="value" style={{ color: 'var(--color-success)' }}>{mappedCount}</div>
          <div className="label">Mapped</div>
        </div>
        <div className="person-stat">
          <div className="value" style={{ color: 'var(--color-warning)' }}>{unmappedCount}</div>
          <div className="label">Unmapped</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="input-field search-input"
            placeholder="Search by name, mobile, or village..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="search-persons"
          />
        </div>
        <div className="filter-tabs">
          {[
            { key: 'all', label: `All (${persons.length})` },
            { key: 'unmapped', label: `Unmapped (${unmappedCount})` },
            { key: 'mapped', label: `Mapped (${mappedCount})` },
          ].map((f) => (
            <button
              key={f.key}
              className={filterMapping === f.key ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => setFilterMapping(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Persons Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredPersons.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem' }}>
            <User size={48} />
            <h3>No persons found</h3>
            <p>Import persons from a PDF or add them manually</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Village</th>
                  <th>Assignments</th>
                  <th>Mapping Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersons.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {p.full_name}
                    </td>
                    <td>
                      {p.mobile ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Phone size={14} style={{ color: 'var(--color-text-muted)' }} />
                          {p.mobile}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {p.village ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <MapPin size={14} style={{ color: 'var(--color-text-muted)' }} />
                          {p.village}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-info">{p.assignments?.[0]?.count || 0}</span>
                    </td>
                    <td>
                      {p.mapped_profile_id ? (
                        <div>
                          <span className="mapping-badge mapped">
                            <CheckCircle size={12} /> Mapped
                          </span>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                            → {p.profiles?.full_name || p.profiles?.email || 'Unknown'}
                          </div>
                        </div>
                      ) : (
                        <span className="mapping-badge unmapped">
                          <Link2 size={12} /> Unmapped
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        {!p.mapped_profile_id ? (
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => openMapModal(p)}
                            title="Map to user"
                            id={`map-person-${p.id}`}
                          >
                            <Link2 size={14} /> Map
                          </button>
                        ) : (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => handleUnmap(p)}
                            title="Unmap from user"
                            id={`unmap-person-${p.id}`}
                          >
                            <Unlink size={14} />
                          </button>
                        )}
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openEditModal(p)}
                          title="Edit person"
                          id={`edit-person-${p.id}`}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => handleDelete(p.id)}
                          title="Delete person"
                          id={`delete-person-${p.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                {editingPerson ? 'Edit Person' : 'Add New Person'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="label">Full Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., સુમંતભાઈ પટેલ"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  id="person-name-input"
                />
              </div>

              <div className="form-group">
                <label className="label">Mobile Number</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., 6345306023"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                  id="person-mobile-input"
                />
              </div>

              <div className="form-group">
                <label className="label">Village</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., સાકરીયા"
                  value={form.village}
                  onChange={(e) => setForm({ ...form, village: e.target.value })}
                  id="person-village-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} id="save-person-btn">
                  {editingPerson ? 'Update Person' : 'Add Person'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map to User Modal */}
      {showMapModal && mappingPerson && (
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
                Mapping person:
              </p>
              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {mappingPerson.full_name}
                {mappingPerson.mobile && ` • ${mappingPerson.mobile}`}
                {mappingPerson.village && ` • ${mappingPerson.village}`}
              </p>
            </div>

            <div className="form-group">
              <label className="label">Search & Select User *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Search by name or email..."
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                style={{ marginBottom: '0.5rem' }}
                id="map-profile-search"
              />
              <select
                className="input-field"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                size={5}
                style={{ minHeight: '150px' }}
                id="map-profile-select"
              >
                {availableProfiles.length === 0 ? (
                  <option disabled>No available users found</option>
                ) : (
                  availableProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || 'No Name'} — {p.email}
                    </option>
                  ))
                )}
              </select>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              Once mapped, all assignments for this person will be linked to the selected user account.
              The user will see these assignments in their "My Work" page.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={handleMap}
                disabled={!selectedProfileId}
                id="confirm-map-btn"
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
