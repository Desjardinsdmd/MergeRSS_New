import React from 'react';
import { Navigate } from 'react-router-dom';

// Read Later moved into the Inbox "Saved" tab. This route stays for old links and bookmarks.
export default function Bookmarks() {
  return <Navigate to="/Inbox?tab=saved" replace />;
}
