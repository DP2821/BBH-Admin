import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Send, HandHeart, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function RequestAvailability() {
  const { profile } = useAuth();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Check if there's already a pending request
      const { data: existing } = await supabase
        .from('availability_requests')
        .select('id')
        .eq('user_id', profile.id)
        .eq('status', 'pending')
        .single();

      if (existing) {
        toast.warning('You already have a pending request. Please wait for admin review.');
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from('availability_requests').insert({
        user_id: profile.id,
        message: message.trim() || null,
        status: 'pending',
      });

      if (error) throw error;
      toast.success('Availability request sent to admin!');
      setSubmitted(true);
      setMessage('');
    } catch (err) {
      toast.error('Failed to submit request');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease', maxWidth: '600px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Request Availability</h1>
          <p className="page-subtitle">Let the admin know you're available for temple work</p>
        </div>
      </div>

      {submitted ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}>
            <CheckCircle size={32} style={{ color: 'var(--color-success)' }} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Request Submitted! 🙏
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            Your availability has been sent to the admin. They will review it and assign work to you soon.
          </p>
          <button className="btn-secondary" onClick={() => setSubmitted(false)}>
            Submit Another Request
          </button>
        </div>
      ) : (
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <HandHeart size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>I am available for Seva</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                The admin will review and assign work
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label">Message (Optional)</label>
              <textarea
                className="input-field"
                placeholder="E.g., I am available on weekends for morning aarti, prasad distribution, or cleaning seva..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                id="availability-message"
              />
              <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.375rem' }}>
                Describe your availability, preferred works, or any notes for the admin.
              </p>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{ width: '100%' }}
              id="submit-availability-btn"
            >
              {submitting ? (
                <>Sending...</>
              ) : (
                <><Send size={16} /> Send Request</>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
        <div className="glass-card" style={{ textAlign: 'center', padding: '1rem' }}>
          <Clock size={20} style={{ color: 'var(--color-warning)', marginBottom: '0.375rem' }} />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Pending</p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Waiting for admin</p>
        </div>
        <div className="glass-card" style={{ textAlign: 'center', padding: '1rem' }}>
          <CheckCircle size={20} style={{ color: 'var(--color-success)', marginBottom: '0.375rem' }} />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Approved</p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Work will be assigned</p>
        </div>
        <div className="glass-card" style={{ textAlign: 'center', padding: '1rem' }}>
          <XCircle size={20} style={{ color: 'var(--color-danger)', marginBottom: '0.375rem' }} />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Rejected</p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Try again later</p>
        </div>
      </div>
    </div>
  );
}
