import {
  CommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';
import { canManageQuiz, hasAdminPrivileges } from '../../utils/permissions.js';

export async function handleEdit(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });

    if (!quiz) {
      await interaction.reply({ content: '❌ Quiz not found.', ephemeral: true });
      return;
    }

    // Check if user can manage this quiz
    const userCanManage = canManageQuiz(
      interaction.user.id,
      (quiz as any).quizOwnerId,
      hasAdminPrivileges(interaction)
    );

    if (!userCanManage) {
      await interaction.reply({
        content: '❌ You can only edit quizzes you own or have admin privileges for.',
        ephemeral: true,
      });
      return;
    }

    // Create modal with current values pre-filled
    const modal = new ModalBuilder().setCustomId(`quiz_edit_modal_${quizId}`).setTitle('Edit Quiz');

    const titleInput = new TextInputBuilder()
      .setCustomId('quiz_title')
      .setLabel('Quiz Title')
      .setStyle(TextInputStyle.Short)
      .setValue(quiz.title)
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('quiz_description')
      .setLabel('Quiz Description (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(quiz.description || '')
      .setRequired(false)
      .setMaxLength(1000);

    const timeLimitInput = new TextInputBuilder()
      .setCustomId('quiz_time_limit')
      .setLabel('Time Limit in Seconds (Optional)')
      .setStyle(TextInputStyle.Short)
      .setValue(((quiz as any).timeLimit || '').toString())
      .setRequired(false)
      .setPlaceholder('e.g., 300 for 5 minutes, leave empty for no limit');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(timeLimitInput)
    );

    await interaction.showModal(modal);
  } catch (error) {
    logger.error('Error editing quiz:', error);
    await interaction.reply({ content: '❌ Error editing quiz.', ephemeral: true });
  }
}
