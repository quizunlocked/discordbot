# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development

- `npm run dev` - Start development server with hot reload using tsx
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run lint` - Run ESLint checks
- `npm run lint:fix` - Fix ESLint errors automatically
- `npm run format` - Format code with Prettier
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode

### Database (Prisma)

- `npm run db:generate` - Generate Prisma client after schema changes
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Prisma Studio for database management
- `npm run db:migrate` - Create and apply migrations
- `npm run db:reset` - Reset database (destructive)

### Discord Bot

- `npm run deploy-commands` - Deploy slash commands to configured dev server
- `npm run deploy-commands -- --guildId=1234567890` - Deploy to specific server

## Architecture Overview

### Core Structure

This is a Discord bot built with Discord.js v14, TypeScript, and Prisma ORM using SQLite. The bot manages interactive quizzes with real-time scoring and leaderboards.

### Key Components

#### Services Layer (`app/services/`)

- `QuizService` - Manages quiz sessions, question flow, and participant interactions
- `DatabaseService` - Handles database connections and operations
- `LeaderboardService` - Calculates and manages scoring/rankings
- `ButtonCleanupService` - Manages Discord button component lifecycles

#### Command Structure (`app/commands/`)

- Commands are organized by feature: `quiz/`, `admin/`, `leaderboard/`
- Each command exports `data` (SlashCommandBuilder) and `execute` function
- Commands are auto-loaded from subdirectories

#### Database Schema (Prisma)

- User progression tracking with quiz attempts and scores
- Flexible quiz system with custom questions and CSV uploads
- Time-based leaderboards (weekly, monthly, yearly)
- Question attempts with detailed scoring metrics

### Key Features

#### Interactive Quiz System

- Real-time multiple choice questions with Discord buttons
- Configurable timeouts and scoring (speed bonuses, streak bonuses)
- Session management with cleanup on timeouts/completion

#### CSV Quiz Upload

- Upload custom quizzes via CSV files with validation
- Template generation for easy quiz creation
- Row-by-row error reporting for malformed data

#### Admin Controls

- Quiz management with destructive operation confirmations
- Privilege checking for admin commands
- Database seeding for empty installations

## Development Notes

### Environment Setup

- Requires Node.js 18.0.0+
- Database URL configured in `.env` (SQLite by default)
- Discord bot token and client ID required
- Optional guild ID for development command deployment

### Testing & Quality

- Jest for testing, ESLint + Prettier for code quality
- Husky git hooks for pre-commit validation
- TypeScript with strict mode enabled

### Bot Permissions

- Requires MESSAGE_CONTENT_INTENT (privileged)
- Needs GUILD_MEMBERS intent for leaderboards
- Administrator permissions for full functionality

### Common Patterns

- Extended Discord.js Client with custom properties (`BotClient` type)
- Singleton pattern for services
- Graceful shutdown handling with cleanup
- Comprehensive error handling with Discord interaction states
