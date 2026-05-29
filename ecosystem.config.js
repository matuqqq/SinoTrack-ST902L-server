module.exports = {
  apps: [
    {
      name: 'sinotrack-server',
      script: 'server.js',

      // Fork mode — NOT cluster: TCP server must be a singleton.
      // Cluster mode would spin up multiple processes each trying to bind
      // port 5013, crashing all but one.
      instances: 1,
      exec_mode: 'fork',

      // Restart if process exceeds 512 MB (memory leak guard)
      max_memory_restart: '512M',

      // Restart backoff — avoids restart storm on repeated crashes
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,

      // Log config
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Watch — off in prod (file changes shouldn't restart)
      watch: false,

      // Env vars loaded from .env by dotenv inside server.js.
      // Override here only for prod-specific values if needed.
      env: {
        NODE_ENV: 'production'
      },

      // Graceful shutdown — wait up to 10s for in-flight requests
      kill_timeout: 10000,
      listen_timeout: 5000
    }
  ]
};
