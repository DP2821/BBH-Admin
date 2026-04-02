import { useAuth } from '../../contexts/AuthContext';
import { LogOut, User, Menu } from 'lucide-react';
import './Header.css';

export default function Header({ onMenuClick }) {
  const { user, profile, signOut, isAdmin } = useAuth();

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="hamburger-btn" onClick={onMenuClick} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <h2 className="header-greeting">
          Jai Shree Krishna 🙏
          {profile?.full_name && (
            <span className="greeting-name">, {profile.full_name}</span>
          )}
        </h2>
      </div>

      <div className="header-right">
        <div className="header-profile">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="avatar" />
          ) : (
            <div className="avatar-placeholder">
              <User size={18} />
            </div>
          )}
          <div className="profile-info">
            <span className="profile-name">{profile?.full_name || user?.email}</span>
            <span className="profile-role">{isAdmin ? 'Admin' : 'Volunteer'}</span>
          </div>
        </div>
        <button className="btn-secondary btn-sm" onClick={signOut} id="logout-btn">
          <LogOut size={16} />
          <span className="logout-label">Logout</span>
        </button>
      </div>
    </header>
  );
}
