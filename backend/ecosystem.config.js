/**
 * PM2 Ecosystem Configuration
 * Chetta's Dosa - Production Process Management
 * 
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production
 *   pm2 logs chettas-api
 */

module.exports = {
    apps: [
        {
            name: 'chettas-api',
            script: 'server.js',
            cwd: '/root/chettas-dosa-website/backend',

            // Instances & Mode
            instances: 'max', // Use all CPU cores
            exec_mode: 'cluster', // Enable clustering for load balancing

            // Environment Variables
            env: {
                NODE_ENV: 'development',
                PORT: 5000
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 5000
            },

            // Restart Policy
            watch: false, // Don't watch files in production
            max_memory_restart: '500M', // Restart if memory exceeds 500MB
            restart_delay: 3000, // Wait 3 seconds before restart
            max_restarts: 10, // Max restarts within min_uptime
            min_uptime: '10s', // Min uptime to be considered started

            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            error_file: '/home/sammy/logs/chettas-api-error.log',
            out_file: '/home/sammy/logs/chettas-api-out.log',
            merge_logs: true,

            // Graceful Shutdown
            kill_timeout: 5000, // Time to wait before SIGKILL
            listen_timeout: 8000, // Time to wait for app to listen

            // Auto-restart on specific exit codes
            autorestart: true,

            // Health Check (optional - requires PM2 Plus)
            // health_check_interval: 30000,
            // health_check_grace_period: 10000
        }
    ],

    // Deployment Configuration (optional for git-based deploys)
    deploy: {
        production: {
            user: 'sammy',
            host: ['YOUR_VPS_IP'],
            ref: 'origin/main',
            repo: 'git@github.com:Deepakscripts/chettas-dosa-website.git',
            path: '/root/chettas-dosa-website',
            'pre-deploy-local': '',
            'post-deploy': 'cd backend && npm install && pm2 reload ecosystem.config.js --env production',
            'pre-setup': ''
        }
    }
};
