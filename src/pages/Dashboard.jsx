import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Briefcase,
  Users,
  ClipboardList,
  AlertTriangle,
  Calendar,
  Clock,
} from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
  const { isAdmin, profile } = useAuth();
  const [stats, setStats] = useState({
    totalWorks: 0,
    totalUsers: 0,
    totalAssignments: 0,
    pendingRequests: 0,
    overlappingCount: 0,
  });
  const [upcomingWorks, setUpcomingWorks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      fetchDashboardData();
    }
  }, [profile?.id]);

  async function fetchDashboardData() {
    try {
      // Fetch works count
      const { count: totalWorks } = await supabase
        .from('works')
        .select('*', { count: 'exact', head: true });

      if (isAdmin) {
        // Admin stats
        const { count: totalUsers } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        const { count: totalAssignments } = await supabase
          .from('assignments')
          .select('*', { count: 'exact', head: true });

        const { count: pendingRequests } = await supabase
          .from('availability_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        setStats({
          totalWorks: totalWorks || 0,
          totalUsers: totalUsers || 0,
          totalAssignments: totalAssignments || 0,
          pendingRequests: pendingRequests || 0,
        });

        // Upcoming works (next 7 days)
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
        const { data: upcoming } = await supabase
          .from('works')
          .select('*')
          .gte('work_date', today)
          .lte('work_date', nextWeek)
          .order('work_date', { ascending: true })
          .limit(5);

        setUpcomingWorks(upcoming || []);
      } else {
        // User stats
        const { data: myAssignments } = await supabase
          .from('assignments')
          .select('*, works(*)')
          .eq('user_id', profile?.id);

        const { count: myRequests } = await supabase
          .from('availability_requests')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile?.id)
          .eq('status', 'pending');

        // Check overlaps
        const overlapping = (myAssignments || []).filter(a => a.has_overlap);

        setStats({
          totalWorks: (myAssignments || []).length,
          pendingRequests: myRequests || 0,
          overlappingCount: overlapping.length,
        });

        // Upcoming assigned works
        const today = new Date().toISOString().split('T')[0];
        const upcomingAssigned = (myAssignments || [])
          .filter(a => a.works && a.works.work_date >= today)
          .sort((a, b) => a.works.work_date.localeCompare(b.works.work_date))
          .slice(0, 5);

        setUpcomingWorks(upcomingAssigned.map(a => ({ ...a.works, assignment_status: a.status, has_overlap: a.has_overlap })));
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {isAdmin ? 'Overview of temple work management' : 'Your work assignments overview'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--color-primary)' }}>
            <Briefcase size={24} />
          </div>
          <div className="stat-value">{stats.totalWorks}</div>
          <div className="stat-label">{isAdmin ? 'Total Works' : 'My Assignments'}</div>
        </div>

        {isAdmin && (
          <>
            <div className="stat-card">
              <div className="stat-icon" style={{ color: 'var(--color-info)' }}>
                <Users size={24} />
              </div>
              <div className="stat-value">{stats.totalUsers}</div>
              <div className="stat-label">Total Users</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ color: 'var(--color-success)' }}>
                <ClipboardList size={24} />
              </div>
              <div className="stat-value">{stats.totalAssignments}</div>
              <div className="stat-label">Total Assignments</div>
            </div>
          </>
        )}

        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--color-warning)' }}>
            <Clock size={24} />
          </div>
          <div className="stat-value">{stats.pendingRequests}</div>
          <div className="stat-label">Pending Requests</div>
        </div>

        {!isAdmin && stats.overlappingCount > 0 && (
          <div className="stat-card stat-card-overlap">
            <div className="stat-icon" style={{ color: 'var(--color-overlap)' }}>
              <AlertTriangle size={24} />
            </div>
            <div className="stat-value">{stats.overlappingCount}</div>
            <div className="stat-label">Overlapping Works</div>
          </div>
        )}
      </div>

      {/* Upcoming Works */}
      <div className="glass-card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Calendar size={20} style={{ color: 'var(--color-primary)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
            {isAdmin ? 'Upcoming Works (Next 7 Days)' : 'My Upcoming Work'}
          </h3>
        </div>

        {upcomingWorks.length === 0 ? (
          <div className="empty-state">
            <Calendar size={40} />
            <h3>No upcoming works</h3>
            <p>{isAdmin ? 'Create a new work to get started' : 'No work assigned yet'}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingWorks.map((work) => (
                <tr key={work.id}>
                  <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                    {work.title}
                  </td>
                  <td>{formatDate(work.work_date)}</td>
                  <td>
                    {work.start_time?.slice(0, 5)} – {work.end_time?.slice(0, 5)}
                  </td>
                  <td>
                    {work.has_overlap && (
                      <span className="badge badge-overlap" style={{ marginRight: '0.5rem' }}>
                        <AlertTriangle size={12} /> Overlap
                      </span>
                    )}
                    <span className={`badge badge-${getStatusColor(work.status)}`}>
                      {work.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function getStatusColor(status) {
  switch (status) {
    case 'open': return 'info';
    case 'in_progress': return 'warning';
    case 'completed': return 'success';
    case 'cancelled': return 'danger';
    case 'assigned': return 'info';
    default: return 'info';
  }
}
