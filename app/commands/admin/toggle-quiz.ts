import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleToggleQuiz(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      await interaction.editReply('❌ Quiz not found.');
      return;
    }

    const newStatus = !quiz.isActive;

    await databaseService.prisma.quiz.update({
      where: { id: quizId },
      data: { isActive: newStatus },
    });

    const embed = new EmbedBuilder()
      .setTitle('🔄 Quiz Status Updated')
      .setDescription(`**${quiz.title}** is now ${newStatus ? '🟢 Active' : '🔴 Inactive'}`)
      .setColor(newStatus ? '#00ff00' : '#ff0000')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error toggling quiz:', error);
    await interaction.editReply('❌ Error updating quiz status.');
  }
}
