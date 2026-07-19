#!/bin/bash
# =============================================================================
# Kea By The Pool - Automated Backup Script
# Backs up MongoDB database and syncs to Cloudflare R2
# =============================================================================
#
# Setup:
#   1. chmod +x backup.sh
#   2. Configure rclone: rclone config (add R2 remote named 'r2_backup')
#   3. Add to crontab: crontab -e
#      0 2 * * * /home/sammy/kea-by-the-pool-website/deployment/scripts/backup.sh >> /var/log/backup.log 2>&1
# =============================================================================

set -e  # Exit on error

# Configuration
BACKUP_DIR="/root/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
MONGO_DB="kea-by-the-pool"
MONGO_URI="mongodb://localhost:27017"  # Update if using auth
R2_REMOTE="r2_backup"  # Name from rclone config
R2_BUCKET="keabythepoolbackupbucket"
RETENTION_DAYS=7
LOG_FILE="/var/log/kea-backup.log"

# Email notification (optional - requires msmtp)
NOTIFY_EMAIL="your_email@gmail.com"
SEND_EMAIL=false  # Set to true to enable

# =============================================================================
# Functions
# =============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

send_notification() {
    local subject="$1"
    local body="$2"
    
    if [ "$SEND_EMAIL" = true ] && command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" "$NOTIFY_EMAIL"
    fi
}

cleanup_old_backups() {
    log "Cleaning up local backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -type f -name "*.tar.gz" -mtime +$RETENTION_DAYS -exec rm -f {} \;
    find "$BACKUP_DIR" -type d -empty -delete
    log "Cleanup complete."
}

# =============================================================================
# Main Backup Process
# =============================================================================

log "=========================================="
log "Starting backup process..."
log "=========================================="

# Create backup directory
BACKUP_PATH="$BACKUP_DIR/$DATE"
mkdir -p "$BACKUP_PATH"

# -----------------------------------------------------------------------------
# 1. MongoDB Dump
# -----------------------------------------------------------------------------
log "Step 1: Dumping MongoDB database..."

# If using authentication (recommended for production):
# mongodump --uri="mongodb://myAdmin:PASSWORD@localhost:27017/kea-by-the-pool?authSource=admin" --out "$BACKUP_PATH/mongo"

mongodump --uri="$MONGO_URI" --db="$MONGO_DB" --out "$BACKUP_PATH/mongo"

if [ $? -eq 0 ]; then
    log "MongoDB dump successful."
else
    log "ERROR: MongoDB dump failed!"
    send_notification "[BACKUP FAILED] Kea By The Pool" "MongoDB dump failed on $(hostname) at $(date)"
    exit 1
fi

# -----------------------------------------------------------------------------
# 2. Backup uploaded files (if stored locally)
# -----------------------------------------------------------------------------
log "Step 2: Backing up uploaded files..."

UPLOADS_DIR="/root/kea-by-the-pool-website/backend/uploads"
if [ -d "$UPLOADS_DIR" ]; then
    cp -r "$UPLOADS_DIR" "$BACKUP_PATH/uploads"
    log "Uploads backup complete."
else
    log "No local uploads directory found (using R2 storage)."
fi

# -----------------------------------------------------------------------------
# 3. Backup environment files (encrypted)
# -----------------------------------------------------------------------------
log "Step 3: Backing up configuration..."

ENV_FILE="/root/kea-by-the-pool-website/backend/.env"
if [ -f "$ENV_FILE" ]; then
    # Create encrypted backup of .env (optional - requires gpg)
    # gpg --symmetric --cipher-algo AES256 -o "$BACKUP_PATH/env.gpg" "$ENV_FILE"
    
    # Or just copy (less secure, but simpler)
    cp "$ENV_FILE" "$BACKUP_PATH/env.backup"
    chmod 600 "$BACKUP_PATH/env.backup"
    log "Environment backup complete."
fi

# -----------------------------------------------------------------------------
# 4. Compress backup
# -----------------------------------------------------------------------------
log "Step 4: Compressing backup..."

ARCHIVE_NAME="kea-backup-$DATE.tar.gz"
tar -zcf "$BACKUP_DIR/$ARCHIVE_NAME" -C "$BACKUP_DIR" "$DATE"

# Get archive size
ARCHIVE_SIZE=$(du -h "$BACKUP_DIR/$ARCHIVE_NAME" | cut -f1)
log "Archive created: $ARCHIVE_NAME ($ARCHIVE_SIZE)"

# Remove uncompressed backup folder
rm -rf "$BACKUP_PATH"

# -----------------------------------------------------------------------------
# 5. Sync to Cloudflare R2
# -----------------------------------------------------------------------------
log "Step 5: Syncing to Cloudflare R2..."

if command -v rclone &> /dev/null; then
    rclone copy "$BACKUP_DIR/$ARCHIVE_NAME" "$R2_REMOTE:$R2_BUCKET/vps-backups/" --progress
    
    if [ $? -eq 0 ]; then
        log "R2 sync successful."
    else
        log "WARNING: R2 sync failed! Backup is still available locally."
        send_notification "[BACKUP WARNING] Kea By The Pool" "R2 sync failed. Local backup available at $BACKUP_DIR/$ARCHIVE_NAME"
    fi
else
    log "WARNING: rclone not installed. Skipping R2 sync."
fi

# -----------------------------------------------------------------------------
# 6. Cleanup old local backups
# -----------------------------------------------------------------------------
cleanup_old_backups

# -----------------------------------------------------------------------------
# 7. Summary
# -----------------------------------------------------------------------------
log "=========================================="
log "Backup completed successfully!"
log "Local: $BACKUP_DIR/$ARCHIVE_NAME"
log "Remote: $R2_REMOTE:$R2_BUCKET/vps-backups/$ARCHIVE_NAME"
log "=========================================="

send_notification "[BACKUP SUCCESS] Kea By The Pool" "Backup completed successfully.
Archive: $ARCHIVE_NAME
Size: $ARCHIVE_SIZE
Time: $(date)"

exit 0
