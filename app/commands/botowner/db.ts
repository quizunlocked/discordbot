import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleDb(interaction: CommandInteraction): Promise<void> {
  try {
    // Get database statistics
    const [userCount, quizCount, questionCount, attemptCount, scoreCount] = await Promise.all([
      databaseService.prisma.user.count(),
      databaseService.prisma.quiz.count(),
      databaseService.prisma.question.count(),
      databaseService.prisma.quizAttempt.count(),
      databaseService.prisma.score.count(),
    ]);

    // Get recent activity
    const recentAttempts = await databaseService.prisma.quizAttempt.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' },
      include: {
        user: true,
        quiz: true,
      },
    });

    const embed = new EmbedBuilder()
      .setTitle('🗄️ Database Statistics')
      .setColor('#0099ff')
      .addFields(
        { name: 'Users', value: userCount.toString(), inline: true },
        { name: 'Quizzes', value: quizCount.toString(), inline: true },
        { name: 'Questions', value: questionCount.toString(), inline: true },
        { name: 'Quiz Attempts', value: attemptCount.toString(), inline: true },
        { name: 'Score Records', value: scoreCount.toString(), inline: true }
      )
      .setTimestamp();

    if (recentAttempts.length > 0) {
      const recentActivity = recentAttempts
        .map(a => `${a.user.username}: ${a.quiz.title} (${a.totalScore} pts)`)
        .join('\n');

      embed.addFields({
        name: 'Recent Activity',
        value: recentActivity,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting database stats:', error);
    await interaction.editReply('❌ Error getting database statistics.');
  }
}
