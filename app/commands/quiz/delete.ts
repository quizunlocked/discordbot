import {
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleDelete(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        _count: {
          select: {
            attempts: true,
            questions: true,
          },
        },
      },
    });

    if (!quiz) {
      await interaction.reply({ content: '❌ Quiz not found.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Quiz Deletion')
      .setDescription(
        `Are you sure you want to delete **${quiz.title}**?\n\nThis will permanently delete:\n• ${quiz._count.questions} questions\n• ${quiz._count.attempts} quiz attempts\n• All related data\n\n**This action cannot be undone!**`
      )
      .setColor('#ff0000')
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_delete_confirm_${quizId}`)
        .setLabel('✅ Delete Quiz')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`quiz_delete_cancel_${quizId}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } catch (error) {
    logger.error('Error deleting quiz:', error);
    await interaction.reply({ content: '❌ Error deleting quiz.', ephemeral: true });
  }
}