import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  ClipboardList,
  HandHeart,
  ChevronLeft,
  ChevronRight,
  Shield,
  FileUp,
  UserCheck,
} from 'lucide-react';
import './Sidebar.css';

const adminLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/works', icon: Briefcase, label: 'Work Management' },
  { to: '/assignments', icon: ClipboardList, label: 'Assignments' },
  { to: '/requests', icon: HandHeart, label: 'Availability Requests' },
  { to: '/users', icon: Users, label: 'User Management' },
  { to: '/pdf-import', icon: FileUp, label: 'Data Import' },
  { to: '/persons', icon: UserCheck, label: 'Persons' },
];

const userLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/my-work', icon: Briefcase, label: 'My Work' },
  { to: '/request-availability', icon: HandHeart, label: 'Request Availability' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { isAdmin, profile } = useAuth();
  const links = isAdmin ? adminLinks : userLinks;

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-brand">
            <Shield size={24} className="brand-icon" />
            <span className="brand-text">BBH Admin</span>
          </div>
        )}
        {collapsed && <Shield size={24} className="brand-icon-solo" />}
        <button className="sidebar-toggle" onClick={onToggle} aria-label="Toggle sidebar">
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={20} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-role">
          {!collapsed && (
            <span className={`role-badge ${isAdmin ? 'role-admin' : 'role-user'}`}>
              {isAdmin ? '🛡️ Admin' : '👤 User'}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
