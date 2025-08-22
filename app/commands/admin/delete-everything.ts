import {
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleDeleteEverything(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    // Get quiz statistics before deletion
    const quizStats = await databaseService.prisma.quiz.findMany({
      include: {
        _count: {
          select: {
            attempts: true,
            questions: true,
          },
        },
      },
    });

    if (quizStats.length === 0) {
      await interaction.reply({ content: '❌ No quizzes found to delete.', ephemeral: true });
      return;
    }

    const totalQuizzes = quizStats.length;
    const totalQuestions = quizStats.reduce((sum, quiz) => sum + quiz._count.questions, 0);
    const totalAttempts = quizStats.reduce((sum, quiz) => sum + quiz._count.attempts, 0);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Delete ALL Quizzes')
      .setDescription(
        `Are you sure you want to delete **ALL ${totalQuizzes} quizzes**?\n\nThis will permanently delete:\n• ${totalQuizzes} quizzes\n• ${totalQuestions} questions\n• ${totalAttempts} quiz attempts\n• All related data\n\n**⚠️ THIS ACTION CANNOT BE UNDONE! ⚠️**`
      )
      .setColor('#ff0000')
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_delete_all_confirm`)
        .setLabel('✅ Delete ALL Quizzes')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`quiz_delete_all_cancel`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } catch (error) {
    logger.error('Error preparing delete all quizzes:', error);
    await interaction.reply({ content: '❌ Error preparing delete all quizzes.', ephemeral: true });
  }
}
