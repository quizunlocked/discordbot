# Deployment Guide

This comprehensive guide covers deploying Quiz Unlocked in production environments, from simple VPS setups to scalable cloud deployments.

## Overview

Quiz Unlocked can be deployed in various configurations depending on your needs:

- **🏠 Self-hosted VPS** - Simple dedicated server deployment
- **☁️ Cloud platforms** - Managed services like Railway, Render, or Heroku
- **📦 Container deployment** - Docker with orchestration
- **⚡ Serverless** - Function-based deployment for scale

## Pre-deployment Checklist

Before deploying to production, ensure you have:

- ✅ **Discord Application** set up with bot token
- ✅ **PostgreSQL database** - local or cloud-hosted
- ✅ **Domain/subdomain** (optional, for webhooks or web interface)
- ✅ **Environment variables** configured
- ✅ **Production bot permissions** tested in a staging server

## VPS Deployment

Deploy Quiz Unlocked on your own virtual private server.

### Server Requirements

**Minimum specs:**

- **CPU**: 1 vCore
- **RAM**: 512MB (1GB+ recommended)
- **Storage**: 10GB available space
- **OS**: Ubuntu 20.04 LTS or similar Linux distribution

**Recommended specs for busy servers:**

- **CPU**: 2+ vCores
- **RAM**: 2GB+
- **Storage**: 20GB+ SSD
- **Network**: Reliable internet connection

### System Setup

#### 1. Update system packages

```bash
sudo apt update && sudo apt upgrade -y
```

#### 2. Install Node.js

```bash
# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version
```

#### 3. Install PostgreSQL

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE USER quiz_bot WITH PASSWORD 'secure_password_here';
CREATE DATABASE quiz_unlocked OWNER quiz_bot;
GRANT ALL PRIVILEGES ON DATABASE quiz_unlocked TO quiz_bot;
\q
EOF
```

#### 4. Install process manager

```bash
# Install PM2 for process management
sudo npm install -g pm2
```

### Application Deployment

#### 1. Clone and setup

```bash
# Create application user
sudo useradd -m -s /bin/bash quiz-bot
sudo su - quiz-bot

# Clone repository
git clone https://github.com/anthonyronda/learn-polish-bot.git
cd learn-polish-bot

# Install dependencies
npm install
```

#### 2. Configure environment

```bash
# Copy environment template
cp env.example .env

# Edit configuration
nano .env
```

Production `.env` configuration:

```env
# Discord Configuration
DISCORD_TOKEN=your_production_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Database Configuration
DATABASE_URL="postgresql://quiz_bot:secure_password_here@localhost:5432/quiz_unlocked"

# Production Settings
NODE_ENV=production
LOG_LEVEL=info

# Optional: Web interface (if implemented)
PORT=3000
HOST=0.0.0.0
```

#### 3. Database setup

```bash
# Generate Prisma client and deploy schema
npm run db:deploy

# Verify database connection
npm run db:studio &  # Opens on port 5555, accessible via tunnel
```

#### 4. Build application

```bash
# Build TypeScript to JavaScript
npm run build

# Test the build
npm start
```

#### 5. Configure PM2

Create PM2 ecosystem file:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'quiz-unlocked',
    script: 'dist/index.js',
    cwd: '/home/quiz-bot/learn-polish-bot',
    env: {
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

Start with PM2:

```bash
# Create logs directory
mkdir -p logs

# Start application
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs quiz-unlocked

# Setup PM2 to start on boot
pm2 startup
pm2 save
```

### Reverse Proxy (Optional)

If you plan to add a web interface, configure nginx:

```bash
# Install nginx
sudo apt install nginx -y

# Create configuration
sudo nano /etc/nginx/sites-available/quiz-unlocked
```

Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
# Enable configuration
sudo ln -s /etc/nginx/sites-available/quiz-unlocked /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

## Cloud Platform Deployment

Deploy Quiz Unlocked on managed cloud platforms.

### Railway Deployment

[Railway](https://railway.app) offers simple deployment with automatic scaling.

#### 1. Setup Railway project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway init
```

#### 2. Configure database

In Railway dashboard:

1. Add PostgreSQL service
2. Copy the connection string from the dashboard

#### 3. Set environment variables

In Railway dashboard or via CLI:

```bash
railway variables set DISCORD_TOKEN=your_bot_token
railway variables set DISCORD_CLIENT_ID=your_client_id
railway variables set DATABASE_URL=your_postgresql_url
railway variables set NODE_ENV=production
```

#### 4. Deploy

```bash
# Deploy to Railway
railway up

# View logs
railway logs
```

### Render Deployment

[Render](https://render.com) provides managed hosting with automatic deployments.

#### 1. Connect repository

1. Fork the Quiz Unlocked repository
2. Connect your GitHub account to Render
3. Create a new Web Service from your fork

#### 2. Configure service

**Build settings:**

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment**: `Node`

**Environment variables:**

```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DATABASE_URL=your_postgresql_url
NODE_ENV=production
```

#### 3. Database setup

1. Create PostgreSQL database in Render
2. Copy internal connection string
3. Update `DATABASE_URL` environment variable

### Heroku Deployment

[Heroku](https://heroku.com) offers easy deployment with add-on marketplace.

#### 1. Create Heroku app

```bash
# Install Heroku CLI and login
heroku login

# Create app
heroku create your-quiz-bot-name

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:mini
```

#### 2. Configure environment

```bash
# Set environment variables
heroku config:set DISCORD_TOKEN=your_bot_token
heroku config:set DISCORD_CLIENT_ID=your_client_id
heroku config:set NODE_ENV=production
```

#### 3. Deploy

```bash
# Deploy from git
git push heroku main

# View logs
heroku logs --tail

# Run database migrations
heroku run npm run db:deploy
```

## Container Deployment

Deploy using Docker for consistent environments.

### Docker Setup

#### 1. Create Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma/ ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Copy application code
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:18-alpine AS production

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S quiz-bot -u 1001
USER quiz-bot

# Expose port (if web interface is added)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

CMD ["npm", "start"]
```

#### 2. Create Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  quiz-bot:
    build: .
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://quiz_bot:password@db:5432/quiz_unlocked
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
    depends_on:
      - db
    volumes:
      - ./logs:/app/logs

  db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=quiz_bot
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=quiz_unlocked
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

#### 3. Environment file

```bash
# .env.docker
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
```

#### 4. Deploy with Docker Compose

```bash
# Build and start services
docker-compose --env-file .env.docker up -d

# View logs
docker-compose logs -f quiz-bot

# Apply database migrations
docker-compose exec quiz-bot npm run db:deploy

# Stop services
docker-compose down
```

### Kubernetes Deployment

For large-scale deployments, use Kubernetes.

#### 1. Create Kubernetes manifests

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: quiz-unlocked

---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: quiz-bot-config
  namespace: quiz-unlocked
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"

---
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: quiz-bot-secrets
  namespace: quiz-unlocked
type: Opaque
stringData:
  discord-token: "your_discord_token"
  discord-client-id: "your_client_id"
  database-url: "postgresql://user:pass@host:5432/db"

---
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: quiz-bot
  namespace: quiz-unlocked
spec:
  replicas: 2
  selector:
    matchLabels:
      app: quiz-bot
  template:
    metadata:
      labels:
        app: quiz-bot
    spec:
      containers:
      - name: quiz-bot
        image: your-registry/quiz-unlocked:latest
        ports:
        - containerPort: 3000
        envFrom:
        - configMapRef:
            name: quiz-bot-config
        - secretRef:
            name: quiz-bot-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: quiz-bot-service
  namespace: quiz-unlocked
spec:
  selector:
    app: quiz-bot
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

#### 2. Deploy to Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n quiz-unlocked

# View logs
kubectl logs -f deployment/quiz-bot -n quiz-unlocked

# Run database migrations
kubectl exec -it deployment/quiz-bot -n quiz-unlocked -- npm run db:deploy
```

## Database Considerations

### Connection Pooling

For production deployments, configure connection pooling:

```typescript
// Update DatabaseService constructor
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'info', 'warn', 'error'],
});
```

For high-traffic deployments, use a connection pooler like PgBouncer:

```bash
# Install PgBouncer
sudo apt install pgbouncer -y

# Configure /etc/pgbouncer/pgbouncer.ini
[databases]
quiz_unlocked = host=localhost port=5432 dbname=quiz_unlocked

[pgbouncer]
listen_port = 6432
listen_addr = 127.0.0.1
pool_mode = session
max_client_conn = 100
default_pool_size = 25
```

Update your `DATABASE_URL` to use the pooler:

```env
DATABASE_URL="postgresql://quiz_bot:password@localhost:6432/quiz_unlocked"
```

### Backup Strategy

Set up automated database backups:

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/backups/quiz-unlocked"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="quiz_unlocked"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create backup
pg_dump -h localhost -U quiz_bot -d $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Keep only last 30 backups
find $BACKUP_DIR -name "backup_*.sql" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql"
```

Add to crontab for automatic daily backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/backup.sh
```

## Monitoring and Maintenance

### Logging

Configure structured logging for production:

```typescript
// Update logger configuration
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});
```

### Health Monitoring

Add health check endpoints:

```typescript
// Add to your main server file
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  });
});

app.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await databaseService.prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});
```

### Performance Monitoring

Use monitoring tools appropriate for your deployment:

**For VPS deployments:**

- **htop/top** - System resource monitoring
- **iostat** - Disk I/O monitoring  
- **netstat** - Network connection monitoring

**For cloud deployments:**

- **Platform dashboards** - Built-in monitoring (Railway, Render, Heroku)
- **External APM** - New Relic, DataDog, or AppDynamics
- **Custom metrics** - Prometheus + Grafana

### Security Considerations

**Environment Security:**

- Use environment variables for all secrets
- Never commit secrets to version control
- Rotate tokens and passwords regularly
- Use least-privilege database permissions

**Network Security:**

- Configure firewalls to only allow necessary ports
- Use HTTPS for any web interfaces
- Implement rate limiting for API endpoints
- Keep system packages updated

**Application Security:**

- Validate all user inputs
- Use parameterized queries (Prisma handles this)
- Implement proper error handling
- Log security-relevant events

## Scaling Considerations

### Horizontal Scaling

Quiz Unlocked can be scaled horizontally with some considerations:

**Stateless Design:**

- Session state stored in database, not memory
- Multiple instances can run simultaneously
- Load balancer can distribute traffic

**Database Scaling:**

- Read replicas for query distribution
- Connection pooling for efficient resource usage
- Database sharding for very large deployments

**Caching Layer:**

- Redis for session caching
- CDN for static assets
- Query result caching for leaderboards

### Performance Optimization

**Application Level:**

- Optimize database queries with proper indexing
- Use connection pooling
- Implement result caching where appropriate
- Profile and optimize hot code paths

**Database Level:**

- Regular VACUUM and ANALYZE operations
- Proper indexing strategy
- Query optimization
- Resource monitoring

**Infrastructure Level:**

- Use SSD storage for database
- Adequate RAM for database caching
- Network optimization for Discord API calls
- Geographic distribution for global users

## Troubleshooting

### Common Deployment Issues

**Database Connection Errors:**

```bash
# Test database connection
psql $DATABASE_URL

# Check PostgreSQL status
sudo systemctl status postgresql

# Review PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

**Discord API Issues:**

```bash
# Verify bot token
curl -H "Authorization: Bot $DISCORD_TOKEN" https://discord.com/api/v10/users/@me

# Check rate limiting
grep -i "rate" logs/combined.log

# Verify bot permissions in Discord server
```

**Memory Issues:**

```bash
# Monitor memory usage
free -h
htop

# Check for memory leaks
ps aux --sort=-%mem | head

# Review Node.js memory usage
node --inspect index.js
```

### Log Analysis

Common log patterns to watch:

**Error Patterns:**

```bash
# Database errors
grep -i "database\|prisma" logs/error.log

# Discord API errors  
grep -i "discord\|api" logs/error.log

# Memory/performance issues
grep -i "memory\|timeout\|slow" logs/combined.log
```

**Performance Metrics:**

```bash
# Response times
grep -i "response.*time" logs/combined.log

# Quiz session metrics
grep -i "quiz.*start\|quiz.*complete" logs/combined.log

# User activity patterns
grep -i "user.*join\|user.*answer" logs/combined.log
```

### Maintenance Tasks

**Regular Tasks:**

- Update system packages monthly
- Rotate log files weekly
- Review error logs daily
- Monitor resource usage continuously

**Database Maintenance:**

```bash
# Vacuum and analyze (weekly)
psql $DATABASE_URL -c "VACUUM ANALYZE;"

# Check database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('quiz_unlocked'));"

# Review slow queries
psql $DATABASE_URL -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

**Application Updates:**

```bash
# Backup before updates
./backup.sh

# Pull latest code
git pull origin main

# Update dependencies
npm ci

# Run database migrations
npm run db:deploy

# Rebuild application
npm run build

# Restart services
pm2 restart quiz-unlocked
```

## Deployment Checklist

Before going live, verify:

- ✅ **Bot token** configured and valid
- ✅ **Database** connection working and migrated
- ✅ **Environment variables** set correctly
- ✅ **Permissions** tested in staging server
- ✅ **Monitoring** and logging configured
- ✅ **Backups** automated and tested
- ✅ **Health checks** responding
- ✅ **Security** measures implemented
- ✅ **Error handling** tested
- ✅ **Documentation** updated

Congratulations! Your Quiz Unlocked bot is now ready for production use. 🎉

For ongoing support, check the [FAQ](/faq) or join our community discussions on GitHub.
