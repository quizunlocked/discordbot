import { EmbedBuilder } from 'discord.js';
import { databaseService } from './DatabaseService';
import { logger } from '@/utils/logger';
import { LeaderboardPeriod, LeaderboardEntry } from '@/types';
import { sumBy, minBy } from '@/utils/arrayUtils';

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
  public async getLeaderboard(period: LeaderboardPeriod, limit: number = 10): Promise<LeaderboardEntry[]> {
    try {
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

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
      const userScores = attempts.reduce((acc, attempt) => {
        const existing = acc.get(attempt.userId);
        if (existing) {
          existing.totalScore += attempt.totalScore;
          existing.totalQuizzes += 1;
          existing.totalTime += attempt.totalTime || 0;
          if (attempt.totalTime && (!existing.bestTime || attempt.totalTime < existing.bestTime)) {
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
            bestTime: attempt.totalTime || undefined,
            attempts: [attempt],
          });
        }
        return acc;
      }, new Map<string, {
        userId: string;
        username: string;
        totalScore: number;
        totalQuizzes: number;
        totalTime: number;
        bestTime: number | undefined;
        attempts: any[];
      }>());

      // Convert to array and sort by total score
      const leaderboard = Array.from(userScores.values())
        .map(user => ({
          userId: user.userId,
          username: user.username,
          totalScore: user.totalScore,
          totalQuizzes: user.totalQuizzes,
          averageScore: user.totalQuizzes > 0 ? Math.round(user.totalScore / user.totalQuizzes) : 0,
          bestTime: user.bestTime,
          rank: 0, // Will be set below
        }))
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, limit);

      // Add ranks
      leaderboard.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      return leaderboard;
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
            bestTime: quizTime && (!existingScore.bestTime || quizTime < existingScore.bestTime)
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
      .map((entry) => {
        const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`;
        const timeText = entry.bestTime ? ` (Best: ${Math.floor(entry.bestTime / 60)}m ${entry.bestTime % 60}s)` : '';
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
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Get user statistics
   */
  public async getUserStats(userId: string): Promise<{
    totalScore: number;
    totalQuizzes: number;
    averageScore: number;
    bestTime: number | undefined;
    rank: number;
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
        })
      ]);

      if (attempts.length === 0) {
        return null;
      }

      const totalScore = sumBy(attempts, attempt => attempt.totalScore);
      const totalQuizzes = attempts.length;
      const averageScore = Math.round(totalScore / totalQuizzes);
      const bestTime = minBy(
        attempts.filter(attempt => attempt.totalTime),
        attempt => attempt.totalTime!
      )?.totalTime;


      const rank = allUsers.findIndex(user => user.userId === userId) + 1;

      return {
        totalScore,
        totalQuizzes,
        averageScore,
        bestTime: bestTime || undefined,
        rank,
      };
    } catch (error) {
      logger.error('Error getting user stats:', error);
      throw error;
    }
  }
}

export const leaderboardService = LeaderboardService.getInstance(); 