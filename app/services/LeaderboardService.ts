import { EmbedBuilder } from 'discord.js';
import { databaseService } from './DatabaseService.js';
import { logger } from '../utils/logger.js';
import { LeaderboardPeriod, LeaderboardEntry } from '../types/index.js';
import { sumBy, minBy } from '../utils/arrayUtils.js';

class LeaderboardService {
  private static instance: LeaderboardService;

  public static getInstance(): LeaderboardService {
    if (!LeaderboardService.instance) {
      LeaderboardService.instance = new LeaderboardService();
    }
    return LeaderboardService.instance;
  }

  /**
   * Get leaderboard for a specific period
   */
  public async getLeaderboard(
    period: LeaderboardPeriod,
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    try {
      const now = new Date();
      let startDate: Date;
      const endDate: Date = now;

      // Calculate date range based on period
      switch (period) {
        case 'weekly':
          startDate = this.getStartOfWeek(now);
          break;
        case 'monthly':
          startDate = this.getStartOfMonth(now);
          break;
        case 'yearly':
          startDate = this.getStartOfYear(now);
          break;
        case 'overall':
          startDate = new Date(0); // Beginning of time
          break;
        default:
          throw new Error(`Invalid period: ${period}`);
      }

      // Get quiz attempts within the date range
      const attempts = await databaseService.prisma.quizAttempt.findMany({
        where: {
          startedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: true,
          questionAttempts: true,
        },
        orderBy: {
          startedAt: 'desc',
        },
      });

      // Aggregate scores by user using functional reduce
      const userScores = attempts.reduce(
        (acc: any, attempt: any) => {
          const existing = acc.get(attempt.userId);

          // Calculate total response time for this attempt
          const questionAttempts = attempt.questionAttempts || [];
          const validQuestionAttempts = questionAttempts.filter((qa: any) => qa.timeSpent != null);
          const attemptTotalResponseTime =
            validQuestionAttempts.length > 0
              ? validQuestionAttempts.reduce((sum: number, qa: any) => sum + qa.timeSpent, 0)
              : 0;

          if (existing) {
            existing.totalScore += attempt.totalScore;
            existing.totalQuizzes += 1;
            existing.totalTime += attempt.totalTime || 0;
            existing.totalResponseTime += attemptTotalResponseTime;
            existing.totalQuestions += validQuestionAttempts.length;
            if (
              attempt.totalTime &&
              (!existing.bestTime || attempt.totalTime < existing.bestTime)
            ) {
              existing.bestTime = attempt.totalTime;
            }
            existing.attempts.push(attempt);
          } else {
            acc.set(attempt.userId, {
              userId: attempt.userId,
              username: attempt.user.username,
              totalScore: attempt.totalScore,
              totalQuizzes: 1,
              totalTime: attempt.totalTime || 0,
              totalResponseTime: attemptTotalResponseTime,
              totalQuestions: validQuestionAttempts.length,
              bestTime: attempt.totalTime || undefined,
              attempts: [attempt],
            });
          }
          return acc;
        },
        new Map<
          string,
          {
            userId: string;
            username: string;
            totalScore: number;
            totalQuizzes: number;
            totalTime: number;
            totalResponseTime: number;
            totalQuestions: number;
            bestTime: number | undefined;
            attempts: any[];
          }
        >()
      );

      // Convert to array and sort by total score
      const leaderboard = Array.from(userScores.values())
        .map((user: any) => ({
          userId: user.userId,
          username: user.username,
          totalScore: user.totalScore,
          totalQuizzes: user.totalQuizzes,
          averageScore: user.totalQuizzes > 0 ? Math.round(user.totalScore / user.totalQuizzes) : 0,
          bestTime: user.bestTime,
          averageResponseTime:
            user.totalQuestions > 0
              ? Number((user.totalResponseTime / user.totalQuestions).toFixed(2))
              : 0,
          rank: 0, // Will be set below
        }))
        .sort((a, b) => {
          // Primary sort: by total score (descending)
          if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;

          // Tie-breaking: by average response time (ascending - faster wins)
          // If one has no response time data, they go last
          if (a.averageResponseTime === 0 && b.averageResponseTime > 0) return 1;
          if (b.averageResponseTime === 0 && a.averageResponseTime > 0) return -1;

          return a.averageResponseTime - b.averageResponseTime;
        });

      // Add ranks BEFORE slicing
      leaderboard.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      // Apply limit after ranking is assigned
      return leaderboard.slice(0, limit);
    } catch (error) {
      logger.error('Error getting leaderboard:', error);
      throw error;
    }
  }

  /**
   * Update or create score record for a user
   */
  public async updateScore(
    userId: string,
    period: LeaderboardPeriod,
    score: number,
    quizTime?: number
  ): Promise<void> {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const week = this.getWeekNumber(now);
      const month = now.getMonth() + 1;

      // Find existing score record
      const whereClause: any = {
        userId,
        period,
        year,
      };

      if (period === 'weekly') {
        whereClause.week = week;
      } else if (period === 'monthly') {
        whereClause.month = month;
      }

      const existingScore = await databaseService.prisma.score.findFirst({
        where: whereClause,
      });

      if (existingScore) {
        // Update existing record
        await databaseService.prisma.score.update({
          where: { id: existingScore.id },
          data: {
            totalScore: existingScore.totalScore + score,
            totalQuizzes: existingScore.totalQuizzes + 1,
            averageScore: (existingScore.totalScore + score) / (existingScore.totalQuizzes + 1),
            bestTime:
              quizTime && (!existingScore.bestTime || quizTime < existingScore.bestTime)
                ? quizTime
                : existingScore.bestTime,
          },
        });
      } else {
        // Create new record
        const createData: any = {
          userId,
          period,
          year,
          totalScore: score,
          totalQuizzes: 1,
          averageScore: score,
        };

        if (period === 'weekly') {
          createData.week = week;
        } else if (period === 'monthly') {
          createData.month = month;
        }

        if (quizTime !== undefined) {
          createData.bestTime = quizTime;
        }

        await databaseService.prisma.score.create({
          data: createData,
        });
      }
    } catch (error) {
      logger.error('Error updating score:', error);
      throw error;
    }
  }

  /**
   * Create leaderboard embed
   */
  public createLeaderboardEmbed(
    period: LeaderboardPeriod,
    entries: LeaderboardEntry[],
    page: number = 1,
    totalPages: number = 1
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`📊 Quiz Leaderboard - ${period.charAt(0).toUpperCase() + period.slice(1)}`)
      .setColor('#0099ff')
      .setTimestamp();

    if (entries.length === 0) {
      embed.setDescription('No quiz data available for this period.');
      return embed;
    }

    const leaderboardText = entries
      .map(entry => {
        const medal =
          entry.rank === 1
            ? '🥇'
            : entry.rank === 2
              ? '🥈'
              : entry.rank === 3
                ? '🥉'
                : `${entry.rank}.`;
        const timeText =
          entry.averageResponseTime > 0 ? ` (Avg time: ${entry.averageResponseTime}s)` : '';
        return `${medal} **${entry.username}** - ${entry.totalScore} pts (${entry.averageScore} avg)${timeText}`;
      })
      .join('\n');

    embed.addFields({ name: 'Leaderboard', value: leaderboardText });

    if (totalPages > 1) {
      embed.setFooter({ text: `Page ${page} of ${totalPages}` });
    }

    return embed;
  }

  /**
   * Get start of week (Monday)
   */
  private getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  }

  /**
   * Get start of month
   */
  private getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /**
   * Get start of year
   */
  private getStartOfYear(date: Date): Date {
    return new Date(date.getFullYear(), 0, 1);
  }

  /**
   * Get week number
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(date.getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Get user statistics
   */
  public async getUserStats(userId: string): Promise<{
    totalScore: number;
    totalQuizzes: number;
    averageScore: number;
    bestTime: number | undefined;
    averageResponseTime: number;
    rank: number;
    correctAnswers: number;
    totalAnswers: number;
  } | null> {
    try {
      // Parallel database queries for better performance
      const [attempts, allUsers] = await Promise.all([
        databaseService.prisma.quizAttempt.findMany({
          where: { userId },
          include: { questionAttempts: true },
          orderBy: { startedAt: 'desc' },
        }),
        databaseService.prisma.quizAttempt.groupBy({
          by: ['userId'],
          _sum: { totalScore: true },
          orderBy: { _sum: { totalScore: 'desc' } },
        }),
      ]);

      if (attempts.length === 0) {
        return null;
      }

      const totalScore = sumBy(attempts, (attempt: any) => attempt.totalScore);
      const totalQuizzes = attempts.length;
      const averageScore = Math.round(totalScore / totalQuizzes);
      const bestTime = minBy(
        attempts.filter((attempt: any) => attempt.totalTime),
        (attempt: any) => attempt.totalTime!
      )?.totalTime;

      // Calculate average response time across all question attempts
      const allQuestionAttempts = attempts.flatMap(
        (attempt: any) => attempt.questionAttempts || []
      );
      const validQuestionAttempts = allQuestionAttempts.filter((qa: any) => qa.timeSpent != null);
      const averageResponseTime =
        validQuestionAttempts.length > 0
          ? Number(
              (
                validQuestionAttempts.reduce((sum: number, qa: any) => sum + qa.timeSpent, 0) /
                validQuestionAttempts.length
              ).toFixed(2)
            )
          : 0;

      // Calculate correct and total answers for success rate
      const correctAnswers = allQuestionAttempts.filter((qa: any) => qa.isCorrect).length;
      const totalAnswers = allQuestionAttempts.length;

      const rank = allUsers.findIndex((user: any) => user.userId === userId) + 1;

      return {
        totalScore,
        totalQuizzes,
        averageScore,
        bestTime: bestTime || undefined,
        averageResponseTime,
        rank,
        correctAnswers,
        totalAnswers,
      };
    } catch (error) {
      logger.error('Error getting user stats:', error);
      throw error;
    }
  }
}

export const leaderboardService = LeaderboardService.getInstance();
