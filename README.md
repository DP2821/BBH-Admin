# BBH Admin — Temple Work Management System

A modern admin panel for managing temple works, volunteer assignments, and availability coordination. Built with React + Supabase.

## 🚀 Tech Stack

- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Authentication**: Google SSO via Supabase Auth
- **Icons**: Lucide React
- **Deployment**: Vercel or Netlify (free tier)

## 📋 Features

### Admin
- **Dashboard** — Overview stats, upcoming works
- **Work Management** — Create, edit, delete temple works with date/time and people count
- **Assignments** — Assign users to works with automatic overlap detection
- **Availability Requests** — Review and approve/reject volunteer requests
- **User Management** — View users, promote/demote admin roles

### User (Volunteer)
- **Dashboard** — Personal stats and upcoming work
- **My Work** — View all assigned works with overlap warnings
- **Request Availability** — Submit request to let admin know you're available

## 🛠️ Setup Instructions

### Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a free account
2. Create a new project (remember the database password)
3. Wait for the project to finish setting up

### Step 2: Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Set Application Type: **Web application**
6. Add Authorized redirect URI: `https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback`
7. Copy the **Client ID** and **Client Secret**
8. In Supabase Dashboard: Go to **Authentication → Providers → Google**
9. Enable Google provider and paste your Client ID and Secret
10. Save

### Step 3: Run Database Migration

1. In Supabase Dashboard, go to **SQL Editor**
2. Copy the contents of `supabase/migration.sql`
3. Paste and click **Run**
4. All tables, policies, and triggers will be created

### Step 4: Configure Environment

1. Copy `.env.example` to `.env`
2. Get your Supabase URL and Anon Key from **Settings → API**
3. Update `.env`:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### Step 5: Make Yourself Admin

1. Sign in with Google (first time — you'll be created as a regular user)
2. Go to Supabase Dashboard → **Table Editor → profiles**
3. Find your row and change `role` from `user` to `admin`
4. Or run this SQL:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE email = 'your.email@gmail.com';
   ```

### Step 6: Run Locally

```bash
cd admin
npm install
npm run dev
```

Open `http://localhost:5173`

## 📁 Project Structure

```
admin/
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   └── ProtectedRoute.jsx
│   │   └── layout/
│   │       ├── AppLayout.jsx / .css
│   │       ├── Header.jsx / .css
│   │       └── Sidebar.jsx / .css
│   ├── contexts/
│   │   ├── AuthContext.jsx
│   │   └── ToastContext.jsx
│   ├── lib/
│   │   └── supabase.js
│   ├── pages/
│   │   ├── Assignments.jsx
│   │   ├── AvailabilityRequests.jsx
│   │   ├── Dashboard.jsx / .css
│   │   ├── Login.jsx / .css
│   │   ├── MyWork.jsx
│   │   ├── RequestAvailability.jsx
│   │   ├── UserManagement.jsx
│   │   └── WorkManagement.jsx / .css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── supabase/
│   └── migration.sql
├── .env.example
└── package.json
```

## 🔐 Security

- Row Level Security (RLS) on all tables
- Users can only see their own data
- Admin-only operations enforced at database level
- Google OAuth for secure authentication

## 📞 Deployment

### Vercel (Recommended)
1. Push to GitHub
2. Connect to [Vercel](https://vercel.com)
3. Add environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
4. Deploy!

### Netlify
1. Push to GitHub
2. Connect to [Netlify](https://netlify.com)
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Add environment variables
6. Deploy!
