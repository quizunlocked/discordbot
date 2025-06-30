import { Client, Collection, CommandInteraction, SlashCommandBuilder } from 'discord.js';

// Bot Client with custom properties
export interface BotClient extends Client {
  commands: Collection<string, Command>;
  cooldowns: Collection<string, Collection<string, number>>;
}

// Command interface
export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: CommandInteraction) => Promise<void>;
  cooldown?: number;
}

// Quiz related types
export interface QuizConfig {
  title: string;
  description?: string;
  questions: QuestionData[];
  timeLimit?: number; // Total quiz time limit in seconds
}

export interface QuestionData {
  questionText: string;
  options: string[];
  correctAnswer: number; // Index of correct answer
  points?: number;
  timeLimit?: number; // Individual question time limit
}

export interface QuizSession {
  id: string;
  quizId: string;
  channelId: string;
  messageId?: string;
  currentQuestionIndex: number;
  participants: Map<string, ParticipantData>;
  startTime: Date;
  questionStartTime?: Date; // Track when current question started
  isActive: boolean;
  isWaiting: boolean; // Track if quiz is in waiting period
  isQuestionComplete: boolean; // Track if current question has been completed
}

export interface ParticipantData {
  userId: string;
  username: string;
  score: number;
  streak: number;
  answers: Map<number, AnswerData>;
  startTime: Date;
}

export interface AnswerData {
  questionIndex: number;
  selectedAnswer: number;
  isCorrect: boolean;
  timeSpent: number; // Time spent in seconds
  pointsEarned: number;
  answeredAt: Date;
}

// Leaderboard types
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'yearly' | 'overall';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  totalScore: number;
  totalQuizzes: number;
  averageScore: number;
  bestTime: number | undefined;
  rank: number;
}

// Environment configuration
export interface Config {
  token: string;
  clientId: string;
  devGuildId?: string | undefined;
  databaseUrl: string;
  nodeEnv: string;
  logLevel: string;
  quiz: {
    defaultQuestionTimeout: number;
    defaultQuizTimeout: number;
    pointsPerCorrectAnswer: number;
    speedBonusMultiplier: number;
    streakBonusMultiplier: number;
  };
}

// Database types (matching Prisma schema)
export interface User {
  id: string;
  username: string;
  createdAt: Date;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface Question {
  id: string;
  quizId: string;
  questionText: string;
  options: string;
  correctAnswer: number;
  points: number;
  timeLimit?: number;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  quizId: string;
  startedAt: Date;
  completedAt?: Date;
  totalScore: number;
  totalTime?: number;
}

export interface QuestionAttempt {
  id: string;
  quizAttemptId: string;
  questionId: string;
  selectedAnswer?: number;
  isCorrect?: boolean;
  timeSpent?: number;
  pointsEarned: number;
  answeredAt: Date;
}

export interface Score {
  id: string;
  userId: string;
  period: string;
  year: number;
  week?: number;
  month?: number;
  totalScore: number;
  totalQuizzes: number;
  averageScore: number;
  bestTime?: number;
} 