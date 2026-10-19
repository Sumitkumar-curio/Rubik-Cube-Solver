# Deploy TWENTY on Render (live public URL)

Your GitHub repo only stores code. **Render runs the backend + website** and gives you an `https://` link to share.

## Before you start

1. Code must be on GitHub:  
   https://github.com/Sumitkumar-curio/Rubik-Cube-Solver  
2. Create a free Render account:  
   https://render.com → **Get Started** → sign up with **GitHub**

---

## Step-by-step

### 1. New Web Service

1. Open https://dashboard.render.com  
2. Click **New +** → **Web Service**  
3. Click **Connect account** / connect GitHub if asked  
4. Find **Rubik-Cube-Solver** → click **Connect**

### 2. Configure the service

| Setting | Value |
|--------|--------|
| **Name** | `rubik-cube-solver` (or anything) |
| **Region** | closest to you (e.g. Singapore / Oregon) |
| **Branch** | `main` |
| **Runtime** | **Docker** |
| **Instance type** | **Free** |

Leave **Dockerfile path** as `./Dockerfile` (default).

### 3. Environment (optional but good)

In **Environment**:

| Key | Value |
|-----|--------|
| `HOST` | `0.0.0.0` |

`PORT` is set automatically by Render — do **not** hardcode it.

### 4. Deploy

1. Click **Create Web Service**  
2. Wait for the build (first time can take **5–10 minutes** — it builds solver tables in Docker)  
3. When status is **Live**, open the URL at the top, e.g.  
   `https://rubik-cube-solver.onrender.com`

### 5. Test

1. Open that URL  
2. Click **Demo scramble** → should solve  
3. On phone (same link): try **Camera** on a face  

If `/api/health` in the browser shows `{"ok": true, ...}`, backend is working.

---

## Share this link

Share the **Render URL** (not the GitHub URL):

```
https://YOUR-SERVICE-NAME.onrender.com
```

That link uses your Python backend for solve / camera / upload.

---

## Free tier notes

- After ~15 minutes idle, the service **sleeps**. First visit after sleep can take **30–60 seconds** to wake up.  
- For always-on, upgrade to a paid instance later.

## If deploy fails

- **Build timeout**: retry; first Docker build is heavy.  
- **Health check failed**: confirm Dockerfile exists on `main` and `/api/health` works.  
- **Not found / wrong repo**: make sure GitHub repo is **public** or Render has access to private repos.
