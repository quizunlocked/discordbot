import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleGet(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: true,
        attempts: {
          include: {
            user: true,
            questionAttempts: true,
          },
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            questions: true,
            attempts: true,
          },
        },
      },
    });

    if (!quiz) {
      await interaction.reply({ content: '❌ Quiz not found.', ephemeral: true });
      return;
    }

    // Calculate statistics
    const totalParticipants = new Set(quiz.attempts.map(a => a.userId)).size;
    const averageScore =
      quiz.attempts.length > 0
        ? Math.round(quiz.attempts.reduce((sum, a) => sum + a.totalScore, 0) / quiz.attempts.length)
        : 0;

    const embed = new EmbedBuilder()
      .setTitle(`📊 Quiz Information: ${quiz.title}`)
      .setDescription(quiz.description || 'No description available')
      .setColor(quiz.isActive ? '#00ff00' : '#ff0000')
      .addFields(
        { name: 'Status', value: quiz.isActive ? '🟢 Active' : '🔴 Inactive', inline: true },
        { name: 'Questions', value: quiz._count.questions.toString(), inline: true },
        { name: 'Total Attempts', value: quiz._count.attempts.toString(), inline: true },
        { name: 'Unique Participants', value: totalParticipants.toString(), inline: true },
        { name: 'Average Score', value: averageScore.toString(), inline: true },
        { name: 'Created', value: quiz.createdAt.toLocaleDateString(), inline: true }
      )
      .setTimestamp();

    if (quiz.questions.length > 0) {
      const questionsText = quiz.questions
        .map(
          (q, i) =>
            `${i + 1}. ${q.questionText.substring(0, 50)}${q.questionText.length > 50 ? '...' : ''}`
        )
        .join('\n');

      embed.addFields({
        name: 'Questions Preview',
        value: questionsText.substring(0, 1024) + (questionsText.length > 1024 ? '...' : ''),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error('Error getting quiz info:', error);
    await interaction.reply({ content: '❌ Error getting quiz information.', ephemeral: true });
  }
}
