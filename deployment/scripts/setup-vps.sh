#!/bin/bash
# =============================================================================
# Chetta's Dosa - VPS Initial Setup Script
# Run this as root on a fresh Ubuntu 22.04 VPS
# =============================================================================
#
# Usage:
#   chmod +x setup-vps.sh
#   sudo ./setup-vps.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
# Note: We're using root user as per Contabo setup
# For better security, create a non-root user later
SSH_PORT=22  # Change if you want non-standard SSH port

echo ""
echo "==========================================="
echo "  Chetta's Dosa - VPS Setup Script"
echo "==========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (sudo ./setup-vps.sh)"
    exit 1
fi

# =============================================================================
# Phase 1: System Update
# =============================================================================
log_info "Phase 1: Updating system packages..."

apt update && apt upgrade -y
apt install -y curl wget git unzip htop ncdu

log_success "System updated."

# =============================================================================
# Phase 2: Create Directories
# =============================================================================
log_info "Phase 2: Creating directories..."

# Create directories for root
mkdir -p /root/logs
mkdir -p /root/backups

log_success "Directories created."

# =============================================================================
# Phase 3: Configure Firewall (UFW)
# =============================================================================
log_info "Phase 3: Configuring UFW Firewall..."

apt install -y ufw

ufw default deny incoming
ufw default allow outgoing
ufw limit ssh
ufw allow http
ufw allow https
ufw --force enable

log_success "UFW configured and enabled."
ufw status

# =============================================================================
# Phase 4: Install Fail2Ban
# =============================================================================
log_info "Phase 4: Installing Fail2Ban..."

apt install -y fail2ban

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 24h
EOF

systemctl start fail2ban
systemctl enable fail2ban

log_success "Fail2Ban installed and configured."

# =============================================================================
# Phase 5: Secure Shared Memory
# =============================================================================
log_info "Phase 5: Securing shared memory..."

if ! grep -q "tmpfs /dev/shm" /etc/fstab; then
    echo "tmpfs /dev/shm tmpfs defaults,noexec,nosuid 0 0" >> /etc/fstab
    mount -o remount /dev/shm
    log_success "Shared memory secured."
else
    log_warn "Shared memory already secured. Skipping..."
fi

# =============================================================================
# Phase 6: Network Hardening (Sysctl)
# =============================================================================
log_info "Phase 6: Applying network hardening..."

cat >> /etc/sysctl.conf << 'EOF'

# Chetta's Dosa - Network Hardening
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.conf.all.log_martians = 1
EOF

sysctl -p > /dev/null 2>&1

log_success "Network hardening applied."

# =============================================================================
# Phase 7: Install Node.js via NVM
# =============================================================================
log_info "Phase 7: Installing Node.js via NVM..."

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts
npm install -g pm2

log_success "Node.js and PM2 installed."

# =============================================================================
# Phase 8: Install Nginx
# =============================================================================
log_info "Phase 8: Installing Nginx..."

apt install -y nginx

systemctl start nginx
systemctl enable nginx

# Remove default site
rm -f /etc/nginx/sites-enabled/default

log_success "Nginx installed."

# =============================================================================
# Phase 9: Install Certbot (Let's Encrypt)
# =============================================================================
log_info "Phase 9: Installing Certbot for SSL..."

apt install -y certbot python3-certbot-nginx

log_success "Certbot installed. Run 'sudo certbot --nginx -d yourdomain.com' after setting up Nginx."

# =============================================================================
# Phase 10: Install MongoDB
# =============================================================================
log_info "Phase 10: Installing MongoDB 7.0..."

apt-get install -y gnupg curl

curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
    gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Ubuntu 24.04 (noble) - use jammy packages as they work
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
    tee /etc/apt/sources.list.d/mongodb-org-7.0.list

apt-get update
apt-get install -y mongodb-org

systemctl start mongod
systemctl enable mongod

log_success "MongoDB installed."
log_warn "Remember to secure MongoDB with authentication!"

# =============================================================================
# Phase 11: Install Redis
# =============================================================================
log_info "Phase 11: Installing Redis..."

apt install -y redis-server

sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf

systemctl restart redis.service
systemctl enable redis.service

log_success "Redis installed and configured."

# =============================================================================
# Phase 12: Install rclone (for backups)
# =============================================================================
log_info "Phase 12: Installing rclone for backups..."

curl https://rclone.org/install.sh | bash

log_success "rclone installed. Run 'rclone config' to set up R2."

# =============================================================================
# Phase 13: Configure Log Rotation
# =============================================================================
log_info "Phase 13: Configuring log rotation..."

cat > /etc/logrotate.d/chettas-dosa << 'EOF'
/root/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
}
EOF

log_success "Log rotation configured."

# =============================================================================
# Phase 14: Install Monitoring (Optional)
# =============================================================================
log_info "Phase 14: Installing Lynis security scanner..."

apt install -y lynis

log_success "Lynis installed. Run 'sudo lynis audit system' for security audit."

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "==========================================="
echo -e "${GREEN}  VPS Setup Complete!${NC}"
echo "==========================================="
echo ""
echo "Installed Components:"
echo "  ✅ UFW Firewall (SSH, HTTP, HTTPS)"
echo "  ✅ Fail2Ban (Brute-force protection)"
echo "  ✅ Node.js LTS (via NVM)"
echo "  ✅ PM2 (Process Manager)"
echo "  ✅ Nginx (Reverse Proxy)"
echo "  ✅ Certbot (SSL Certificates)"
echo "  ✅ MongoDB 7.0"
echo "  ✅ Redis (Caching)"
echo "  ✅ rclone (Backup sync)"
echo "  ✅ Lynis (Security Audit)"
echo ""
echo "Next Steps:"
echo "  1. Clone your repo: git clone https://github.com/Deepakscripts/chettas-dosa-website.git"
echo "  2. Set up Nginx config: /etc/nginx/sites-available/"
echo "  3. Get SSL: sudo certbot --nginx -d yourdomain.com"
echo "  4. Secure MongoDB with authentication"
echo "  5. Configure rclone: rclone config"
echo "  6. Run security audit: sudo lynis audit system"
echo "  7. Configure rclone: rclone config"
echo "  8. Run security audit: sudo lynis audit system"
echo ""
echo "==========================================="
