import dotenv from 'dotenv';
import { Config } from '@/types';

// Load environment variables
dotenv.config();

export const config: Config = {
  token: process.env['DISCORD_TOKEN']!,
  clientId: process.env['DISCORD_CLIENT_ID']!,
  guildId: process.env['DISCORD_GUILD_ID'] || undefined,
  databaseUrl: process.env['DATABASE_URL']!,
  nodeEnv: process.env['NODE_ENV'] || 'development',
  logLevel: process.env['LOG_LEVEL'] || 'info',
  quiz: {
    defaultQuestionTimeout: parseInt(process.env['DEFAULT_QUESTION_TIMEOUT'] || '30'),
    defaultQuizTimeout: parseInt(process.env['DEFAULT_QUIZ_TIMEOUT'] || '300'),
    pointsPerCorrectAnswer: parseInt(process.env['POINTS_PER_CORRECT_ANSWER'] || '10'),
    speedBonusMultiplier: parseFloat(process.env['SPEED_BONUS_MULTIPLIER'] || '0.1'),
    streakBonusMultiplier: parseFloat(process.env['STREAK_BONUS_MULTIPLIER'] || '0.05'),
  },
};

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DATABASE_URL'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
} 