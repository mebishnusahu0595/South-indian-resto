# Chetta's Dosa - Deployment Guide

## 🚀 Deployment Overview

**Frontend**: Cloudflare Pages  
**Backend**: Railway  
**Database**: MongoDB Atlas  
**Image Storage**: Cloudflare R2  

---

## 📋 Step 1: Prepare Environment Variables

### Backend (.env for Railway)

```env
PORT=5000
NODE_ENV=production

# MongoDB Atlas
MONGODB_URI=mongodb+srv://The_Archive_Admin_DB:<PASSWORD>@thearchive.eodczdc.mongodb.net/chettas-dosa?appName=TheArchive

# JWT
JWT_SECRET=<YOUR_STRONG_SECRET>
JWT_EXPIRES_IN=30d

# Twilio (for OTP)
TWILIO_ACCOUNT_SID=<YOUR_TWILIO_SID>
TWILIO_AUTH_TOKEN=<YOUR_TWILIO_TOKEN>
TWILIO_PHONE_NUMBER=<YOUR_TWILIO_NUMBER>

# Cloudflare R2 Storage
R2_ENDPOINT=https://22d5f7b3d2213d24ca45e49edd547fc1.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=e6cba5eb559d546bc33c5adf23de8b4c
R2_SECRET_ACCESS_KEY=27ea47c8974254ebaf51f725b1b72a66b3f009144e0d19c9940929a99671735e
R2_BUCKET_NAME=chettas-dosa
R2_PUBLIC_URL=https://pub-acdf994ea27e4423b2bed79296335c86.r2.dev

# Frontend URL (update after Cloudflare deployment)
FRONTEND_URL=https://your-app.pages.dev
```

### Frontend Environment (Cloudflare Pages)

```env
VITE_API_URL=https://your-backend.railway.app
```

---

## 📤 Step 2: Push to GitHub

### Add Remote Repositories

```bash
# Add both remotes
git remote add deepak https://github.com/Deepakscripts/chettas-dosa-website.git
git remote add chandan https://github.com/chandanrandiveofficial/chettas-dosa-website.git

# Push to both
git add .
git commit -m "Production ready deployment"
git push deepak main
git push chandan main
```

---

## 🚂 Step 3: Deploy Backend to Railway

1. **Go to**: [railway.app](https://railway.app)
2. **Login with GitHub** (chandanrandiveofficial account)
3. **New Project** → **Deploy from GitHub repo**
4. **Select**: `chandanrandiveofficial/chettas-dosa-website`
5. **Configure**:
   - Root Directory: `backend`
   - Start Command: `npm start`
6. **Add Environment Variables** (copy from above)
7. **Deploy** → Get your Railway URL (e.g., `https://xxx.railway.app`)

---

## ☁️ Step 4: Deploy Frontend to Cloudflare Pages

1. **Go to**: [pages.cloudflare.com](https://pages.cloudflare.com)
2. **Login with GitHub** (chandanrandiveofficial account)
3. **Create a project** → **Connect to Git**
4. **Select**: `chandanrandiveofficial/chettas-dosa-website`
5. **Configure Build**:
   - Framework preset: `Vite`
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Build output directory: `dist`
6. **Environment Variables**:
   - `VITE_API_URL` = `https://your-railway-backend.railway.app`
7. **Deploy** → Get your Pages URL

---

## 🔄 Step 5: Update CORS on Backend

After getting your Cloudflare Pages URL, update the `FRONTEND_URL` environment variable on Railway.

---

## 📁 File Structure for Deployment

```
chettas-dosa-website/
├── backend/           # Deploy to Railway
│   ├── package.json
│   ├── server.js
│   └── ...
├── frontend/          # Deploy to Cloudflare Pages
│   ├── package.json
│   ├── vite.config.js
│   └── ...
└── README.md
```

---

## ✅ Deployment Checklist

- [ ] MongoDB password replaced in MONGODB_URI
- [ ] JWT_SECRET set to a strong random string
- [ ] Twilio credentials configured
- [ ] R2 credentials added
- [ ] Code pushed to GitHub
- [ ] Backend deployed on Railway
- [ ] Frontend deployed on Cloudflare Pages
- [ ] CORS configured (FRONTEND_URL on Railway)
- [ ] Test login and order placement
- [ ] Test image uploads

---

## 🖼️ Image Migration (Existing Images)

To migrate existing local images to R2, run this script once after deployment:

```bash
node scripts/migrate-images-to-r2.js
```

---

## 🔧 Troubleshooting

### CORS Errors
- Ensure `FRONTEND_URL` on Railway matches your Cloudflare Pages domain

### Image Upload Fails
- Check R2 credentials
- Ensure bucket is public or has proper access

### MongoDB Connection Issues
- Whitelist Railway IPs in MongoDB Atlas (or use 0.0.0.0/0 for all IPs)
