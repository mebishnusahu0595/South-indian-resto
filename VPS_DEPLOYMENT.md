# 🚀 Kea By The Pool - VPS Deployment Guide (Contabo / Ubuntu 22.04)

This is a comprehensive, production-ready deployment guide for self-hosting on a VPS.

---

## 📋 Table of Contents

1. [Quick Start (Automated)](#quick-start-automated)
2. [Phase 1: Initial Server Hardening](#phase-1-initial-server-hardening)
3. [Phase 2: Environment Setup](#phase-2-environment-setup)
4. [Phase 3: Application Deployment](#phase-3-application-deployment)
5. [Phase 4: Nginx & SSL](#phase-4-nginx--ssl)
6. [Phase 5: Monitoring & Alerts](#phase-5-monitoring--alerts)
7. [Phase 6: Backups](#phase-6-backups)
8. [Phase 7: Redis Caching](#phase-7-redis-caching)
9. [Maintenance Commands](#maintenance-commands)
10. [Troubleshooting](#troubleshooting)

---

## ⚡ Quick Start (Automated)

If you want to set up everything quickly, run the automated setup script:

```bash
# SSH into your VPS as root
ssh root@YOUR_VPS_IP

# Download and run setup script
wget https://raw.githubusercontent.com/Deepakscripts/kea-by-the-pool-website/main/deployment/scripts/setup-vps.sh
chmod +x setup-vps.sh
sudo ./setup-vps.sh
```

The script will install: UFW, Fail2Ban, Node.js, PM2, Nginx, MongoDB, Redis, Certbot, and rclone.

---

## 🛡️ Phase 1: Initial Server Hardening

### 1.1 Update System
```bash
apt update && apt upgrade -y
```

### 1.2 Create Non-Root User
```bash
adduser sammy
usermod -aG sudo sammy
```

### 1.3 SSH Key Setup (On your LOCAL machine)
```bash
# Generate SSH key if you don't have one
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy to VPS
ssh-copy-id sammy@YOUR_VPS_IP
```

### 1.4 Disable Root Login (On VPS)
```bash
sudo nano /etc/ssh/sshd_config
```
Change these lines:
```
PermitRootLogin no
PasswordAuthentication no
```
Restart SSH:
```bash
sudo systemctl restart ssh
```

> ⚠️ **WARNING**: Test SSH login in a NEW terminal before closing current session!

### 1.5 Configure Firewall (UFW)
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw limit ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

### 1.6 Install Fail2Ban
```bash
sudo apt install fail2ban -y
sudo cp /home/bishnups/kea-by-the-pool-website/deployment/config/fail2ban-jail.conf /etc/fail2ban/jail.local
sudo systemctl restart fail2ban
sudo systemctl enable fail2ban
```

### 1.7 Secure Shared Memory
```bash
echo "tmpfs /dev/shm tmpfs defaults,noexec,nosuid 0 0" | sudo tee -a /etc/fstab
sudo mount -o remount /dev/shm
```

### 1.8 Network Hardening
```bash
sudo nano /etc/sysctl.conf
```
Add these lines:
```
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
```
Apply:
```bash
sudo sysctl -p
```

---

## 🌱 Phase 2: Environment Setup

### 2.1 Install Node.js (via NVM)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts
nvm use --lts
```

### 2.2 Install PM2
```bash
npm install -g pm2
```

### 2.3 Install MongoDB
```bash
# Import key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add repo (Ubuntu 22.04)
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

### 2.4 Secure MongoDB
```bash
# Edit config
sudo nano /etc/mongod.conf
```
Ensure:
```yaml
net:
  bindIp: 127.0.0.1

security:
  authorization: enabled
```

Create admin user:
```bash
mongosh
```
```javascript
use admin
db.createUser({
  user: "myAdmin",
  pwd: passwordPrompt(),
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    "readWriteAnyDatabase"
  ]
})
exit
```
Restart:
```bash
sudo systemctl restart mongod
```

### 2.5 Install Redis
```bash
sudo apt install redis-server -y
sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
sudo systemctl restart redis.service
sudo systemctl enable redis.service
```

---

## 🌿 Phase 3: Application Deployment

### 3.1 Clone Repository
```bash
cd /home/sammy
git clone https://github.com/Deepakscripts/kea-by-the-pool-website.git
cd kea-by-the-pool-website
```

### 3.2 Setup Backend
```bash
cd backend
npm install

# Create environment file
nano .env
```
Paste your production environment variables:
```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb://myAdmin:PASSWORD@localhost:27017/kea-by-the-pool?authSource=admin
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRES_IN=30d
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_key
R2_SECRET_ACCESS_KEY=your_r2_secret
R2_BUCKET_NAME=kea-by-the-pool
R2_PUBLIC_URL=https://pub-xxx.r2.dev
FRONTEND_URL=https://yourdomain.com
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 3.3 Build Frontend
```bash
cd ../frontend
npm install

# Create env file
echo "VITE_API_URL=https://yourdomain.com" > .env.production

npm run build
```

### 3.4 Start with PM2
```bash
cd ../backend
pm2 start ecosystem.config.js --env production

# Save PM2 config and enable on boot
pm2 save
pm2 startup
# Run the command PM2 outputs
```

---

## 🚪 Phase 4: Nginx & SSL

### 4.1 Install Nginx
```bash
sudo apt install nginx -y
```

### 4.2 Configure Nginx
```bash
# Copy config
sudo cp /home/sammy/kea-by-the-pool-website/deployment/nginx/kea-by-the-pool.conf /etc/nginx/sites-available/kea-by-the-pool

# Edit with your domain
sudo nano /etc/nginx/sites-available/kea-by-the-pool
# Replace 'yourdomain.com' with your actual domain
# Replace 'sammy' with your actual username if different

# Enable site
sudo ln -s /etc/nginx/sites-available/kea-by-the-pool /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test and restart
sudo nginx -t
sudo systemctl restart nginx
```

### 4.3 SSL with Certbot
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

---

## 📊 Phase 5: Monitoring & Alerts

### 5.1 System Email Setup (msmtp)
```bash
sudo apt install msmtp msmtp-mta mailutils -y

# Configure
sudo cp /home/sammy/kea-by-the-pool-website/deployment/config/msmtprc.example /etc/msmtprc
sudo nano /etc/msmtprc
# Update with your Gmail and App Password

sudo chmod 600 /etc/msmtprc

# Test
echo "Test from VPS" | mail -s "VPS Test" your_email@gmail.com
```

### 5.2 Daily System Digest (Logwatch)
```bash
sudo apt install logwatch -y
sudo cp /home/sammy/kea-by-the-pool-website/deployment/config/logwatch.conf /etc/logwatch/conf/logwatch.conf
sudo nano /etc/logwatch/conf/logwatch.conf
# Update email address
```

### 5.3 Netdata (Real-time Monitoring)
```bash
bash <(curl -Ss https://my-netdata.io/kickstart.sh)
```
Access at `http://YOUR_VPS_IP:19999`

> 🔐 Block public access: `sudo ufw deny 19999`
> Access via SSH tunnel: `ssh -L 19999:localhost:19999 sammy@YOUR_VPS_IP`

### 5.4 PM2 Log Rotation
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 10
```

---

## 💾 Phase 6: Backups

### 6.1 Install rclone
```bash
sudo -v ; curl https://rclone.org/install.sh | sudo bash
```

### 6.2 Configure Cloudflare R2
```bash
rclone config
```
Follow prompts:
- Name: `r2_backup`
- Type: `s3`
- Provider: `Cloudflare`
- Access Key: (from Cloudflare R2 dashboard)
- Secret Key: (from Cloudflare R2 dashboard)
- Endpoint: `https://ACCOUNT_ID.r2.cloudflarestorage.com`

### 6.3 Setup Backup Script
```bash
chmod +x /home/sammy/kea-by-the-pool-website/deployment/scripts/backup.sh

# Edit script with your settings
nano /home/sammy/kea-by-the-pool-website/deployment/scripts/backup.sh

# Add to crontab (runs daily at 2 AM)
crontab -e
```
Add line:
```
0 2 * * * /home/sammy/kea-by-the-pool-website/deployment/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### 6.4 Manual Backup
```bash
/home/sammy/kea-by-the-pool-website/deployment/scripts/backup.sh
```

---

## ⚡ Phase 7: Redis Caching

Redis is already installed. To use in your routes:

```javascript
const { getCache, setCache, cacheKeys, cacheTTL } = require('../utils/redis');

// Example: Cache menu items
router.get('/menu', async (req, res) => {
  // Check cache
  const cached = await getCache(cacheKeys.menuAll());
  if (cached) return res.json(cached);
  
  // Query database
  const items = await MenuItem.find({ available: true });
  
  // Cache for 1 hour
  await setCache(cacheKeys.menuAll(), items, cacheTTL.LONG);
  
  res.json(items);
});
```

---

## 🔧 Maintenance Commands

### PM2 Commands
```bash
pm2 status              # View all processes
pm2 logs kea-api        # View logs
pm2 monit               # Real-time monitoring
pm2 restart kea-api     # Restart app
pm2 reload all          # Zero-downtime reload
```

### Nginx Commands
```bash
sudo nginx -t                    # Test config
sudo systemctl restart nginx     # Restart
sudo tail -f /var/log/nginx/kea-by-the-pool-error.log  # View errors
```

### MongoDB Commands
```bash
mongosh                          # Connect to shell
sudo systemctl status mongod     # Check status
```

### Fail2Ban Commands
```bash
sudo fail2ban-client status sshd       # View SSH bans
sudo fail2ban-client unban IP_ADDRESS  # Unban IP
```

### Security Audit
```bash
sudo apt install lynis -y
sudo lynis audit system   # Full security audit
```

---

## 🔥 Troubleshooting

### CORS Errors
- Check `FRONTEND_URL` in backend `.env`
- Ensure Nginx is passing correct headers

### MongoDB Connection Failed
- Check if mongod is running: `sudo systemctl status mongod`
- Verify credentials in `.env`
- Check `bindIp` in `/etc/mongod.conf`

### SSL Certificate Issues
- Renew manually: `sudo certbot renew`
- Check logs: `/var/log/letsencrypt/`

### PM2 Not Starting on Boot
```bash
pm2 startup
# Copy and run the generated command
pm2 save
```

### Redis Not Connecting
- Check status: `sudo systemctl status redis`
- Verify config: `redis-cli ping` (should return PONG)

---

## 📁 File Structure

```
kea-by-the-pool-website/
├── backend/
│   ├── ecosystem.config.js    # PM2 config
│   ├── utils/redis.js         # Redis caching
│   └── ...
├── frontend/
│   └── dist/                  # Built files (served by Nginx)
├── deployment/
│   ├── nginx/
│   │   └── kea-by-the-pool.conf  # Nginx config
│   ├── config/
│   │   ├── fail2ban-jail.conf
│   │   ├── msmtprc.example
│   │   └── logwatch.conf
│   └── scripts/
│       ├── setup-vps.sh       # Automated setup
│       └── backup.sh          # Backup script
├── DEPLOYMENT.md              # Railway/Cloudflare guide
└── VPS_DEPLOYMENT.md          # This guide
```

---

## 🔐 Final Checklist

- [ ] SSH keys configured, password auth disabled
- [ ] UFW firewall enabled (SSH, HTTP, HTTPS only)
- [ ] Fail2Ban active and monitoring
- [ ] MongoDB secured with authentication
- [ ] Node.js app running via PM2
- [ ] Nginx configured with SSL
- [ ] Certbot auto-renewal working
- [ ] Email alerts configured
- [ ] Backups automated to R2
- [ ] Redis caching enabled
- [ ] Lynis security score > 80

---

**Need help?** Check PM2 logs: `pm2 logs kea-api`
