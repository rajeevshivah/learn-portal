# PyMaster India — Learn Portal
**learn.rajeevshivah.me**

Student portal for episode-wise notes, PDFs, and resources.

---

## Stack
- Frontend: React + Vite → Vercel
- Backend:  Node.js + Express → Render
- Database: MongoDB Atlas
- Files:    Cloudinary (PDFs, docs)
- Auth:     Google OAuth + JWT

---

## Setup

### 1. MongoDB Atlas
- Create a free cluster at mongodb.com
- Get your connection string
- Whitelist all IPs (0.0.0.0/0) for Render

### 2. Cloudinary
- Create free account at cloudinary.com
- Get Cloud Name, API Key, API Secret

### 3. Google OAuth
- Go to console.cloud.google.com
- Create a project → OAuth 2.0 Client ID
- Authorized origins: http://localhost:5173, https://learn.rajeevshivah.me
- Authorized redirects: same

### 4. Backend setup
```bash
cd backend
npm install
cp .env.example .env
# Fill in all values in .env
npm run dev
```

### 5. Frontend setup
```bash
cd frontend
npm install
cp .env.example .env
# Fill VITE_API_URL and VITE_GOOGLE_CLIENT_ID
npm run dev
```

---

## Make yourself admin
After logging in once with Google, go to MongoDB Atlas:
- Open the `users` collection
- Find your document
- Change `role` from `"student"` to `"admin"`
- Log out and log back in → you will see the Admin button

---

## Deploy

### Backend → Render
- New Web Service → connect GitHub repo
- Root directory: `backend`
- Build command: `npm install`
- Start command: `node server.js`
- Add all .env variables in Render dashboard

### Frontend → Vercel
- Import GitHub repo
- Root directory: `frontend`
- Add VITE_API_URL (your Render URL) and VITE_GOOGLE_CLIENT_ID
- Deploy

### Custom domain
- In Vercel: add `learn.rajeevshivah.me`
- In GoDaddy DNS: add CNAME record pointing to Vercel

---

## Admin workflow (per episode)
1. Go to learn.rajeevshivah.me/admin
2. Create episode — fill number, title, phase, YouTube URL
3. Select episode → upload files (PDF, docx, pptx etc)
4. Toggle Published when ready
5. Students see it immediately

---

## Folder structure
```
learn-portal/
├── backend/
│   ├── config/
│   │   ├── db.js
│   │   └── cloudinary.js
│   ├── middleware/
│   │   └── auth.js
│   ├── models/
│   │   ├── User.js
│   │   └── Episode.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── episodes.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Episodes.jsx
    │   │   ├── EpisodeDetail.jsx
    │   │   └── Admin.jsx
    │   ├── App.jsx
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── .env.example
```

---

## Coming next week
- Vote for next video feature
- Student doubt submission per episode
