import {
  Client,
  Collection,
  CommandInteraction,
  SlashCommandBuilder,
  AutocompleteInteraction,
} from 'discord.js';
import {
  User as PrismaUser,
  Quiz as PrismaQuiz,
  Question as PrismaQuestion,
  QuizAttempt as PrismaQuizAttempt,
  QuestionAttempt as PrismaQuestionAttempt,
  Image as PrismaImage,
  Hint as PrismaHint,
  Prisma,
} from '@prisma/client';

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
  isPrivate: boolean; // Track if this is a private quiz session
  currentQuestionMessageId?: string; // Track current question message for real-time updates
  answerSubmissionOrder: number; // Counter for tracking answer submission order
  fastestCorrectAnswerId?: string | undefined; // Track which participant submitted fastest correct answer
  lastEmbedUpdate?: Date; // Track last embed update to prevent rate limiting
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
  questionStartedAt: Date; // When question was presented to user
  answeredAt: Date;
  answerRank?: number; // Order in which this answer was submitted
  wasFastestCorrect?: boolean; // True if this was the fastest correct answer
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
  averageResponseTime: number; // Average response time per question in seconds
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

// Enhanced Prisma types with relations
export type QuizWithRelations = PrismaQuiz & {
  questions: PrismaQuestion[];
  attempts: PrismaQuizAttempt[];
  quizOwner?: PrismaUser | null;
};

export type QuizAttemptWithRelations = PrismaQuizAttempt & {
  user: PrismaUser;
  quiz: PrismaQuiz;
  questionAttempts: QuestionAttemptWithRelations[];
};

export type QuestionAttemptWithRelations = PrismaQuestionAttempt & {
  question: PrismaQuestion;
  quizAttempt: PrismaQuizAttempt;
};

export type QuestionWithRelations = PrismaQuestion & {
  quiz: PrismaQuiz;
  hints: PrismaHint[];
  image?: PrismaImage | null;
};

// Database operation types
export type QuizWhereClause = Prisma.QuizWhereInput;
export type ScoreWhereClause = Prisma.ScoreWhereInput;
export type ScoreCreateData = Prisma.ScoreCreateInput;
export type ScoreUpdateData = Prisma.ScoreUpdateInput;

// Leaderboard aggregation types
export interface UserScoreAggregation {
  userId: string;
  username: string;
  totalScore: number;
  totalQuizzes: number;
  totalTime: number;
  totalResponseTime: number;
  totalQuestions: number;
  bestTime: number | undefined;
  attempts: QuizAttemptWithRelations[];
}

// CSV parsing types
export interface ValidationError {
  field: string;
  message: string;
}

export interface RowWithValidation<T = Record<string, unknown>> {
  row: T;
  errors: ValidationError[];
  isValid: boolean;
  rowNumber: number;
}

// Autocomplete interaction type
export type AutocompleteHandler = (interaction: AutocompleteInteraction) => Promise<void>;

// Transaction callback type
export type TransactionCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;

// Discord message options type
export interface DiscordMessageOptions {
  embeds?: any[];
  components?: any[];
  files?: any[];
}
