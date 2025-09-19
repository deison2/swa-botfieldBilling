// src/components/UserAvatar.jsx
import React from 'react';
import { useAuth } from '../auth/AuthContext';
import './UserAvatar.css';

export default function UserAvatar({ size = 40 }) {
  const { email } = useAuth();
  const [showImage, setShowImage] = React.useState(true);

  const initials = React.useMemo(() => {
    if (!email) return '??';
    // Try to build initials from "First Last" if present in email local-part; otherwise letters before '@'
    const local = email.split('@')[0] || '';
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }, [email]);

  // If image errors or server returns no content, fall back.
  const src = `/api/myPhoto?size=64x64`; // optional: accept size prop and map to Graph sizes

  return (
    <div className="user-avatar" style={{ width: size, height: size }}>
      {showImage ? (
        <img
          src={src}
          alt="Profile"
          onError={() => setShowImage(false)}
          className="user-avatar__img"
          decoding="async"
          loading="lazy"
        />
      ) : (
        <span className="user-avatar__initials" aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}