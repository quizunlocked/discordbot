import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleStats(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const user = interaction.options.getUser('user', true);

    // Get user data
    const userData = await databaseService.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        quizAttempts: {
          include: {
            quiz: true,
            questionAttempts: true,
          },
          orderBy: { startedAt: 'desc' },
        },
        scores: {
          orderBy: { year: 'desc' },
        },
      },
    });

    if (!userData) {
      await interaction.editReply('❌ User not found in database.');
      return;
    }

    // Calculate statistics
    const totalQuizzes = userData.quizAttempts.length;
    const totalScore = userData.quizAttempts.reduce((sum, a) => sum + a.totalScore, 0);
    const averageScore = totalQuizzes > 0 ? Math.round(totalScore / totalQuizzes) : 0;
    const correctAnswers = userData.quizAttempts.reduce(
      (sum, a) => sum + a.questionAttempts.filter(qa => qa.isCorrect).length,
      0
    );
    const totalAnswers = userData.quizAttempts.reduce(
      (sum, a) => sum + a.questionAttempts.length,
      0
    );
    const successRate = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle(`📊 User Statistics: ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .setColor('#0099ff')
      .addFields(
        { name: 'Total Quizzes', value: totalQuizzes.toString(), inline: true },
        { name: 'Total Score', value: totalScore.toString(), inline: true },
        { name: 'Average Score', value: averageScore.toString(), inline: true },
        { name: 'Correct Answers', value: correctAnswers.toString(), inline: true },
        { name: 'Total Answers', value: totalAnswers.toString(), inline: true },
        { name: 'Success Rate', value: `${successRate}%`, inline: true }
      )
      .setTimestamp();

    // Add recent quiz attempts
    if (userData.quizAttempts.length > 0) {
      const recentAttempts = userData.quizAttempts
        .slice(0, 5)
        .map(a => `${a.quiz.title}: ${a.totalScore} pts (${a.startedAt.toLocaleDateString()})`)
        .join('\n');

      embed.addFields({
        name: 'Recent Quiz Attempts',
        value: recentAttempts,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting user stats:', error);
    await interaction.editReply('❌ Error getting user statistics.');
  }
}
