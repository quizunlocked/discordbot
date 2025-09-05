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

export async function handleHintEdit(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const hintId = interaction.options.getString('hint_id', true);

    // Find the hint and its related question and quiz
    const hint = await databaseService.prisma.hint.findUnique({
      where: { id: hintId },
      include: {
        question: {
          include: {
            quiz: true,
          },
        },
      },
    });

    if (!hint) {
      await interaction.reply({ content: '❌ Hint not found.', ephemeral: true });
      return;
    }

    // Check if user can manage this quiz
    const userCanManage = canManageQuiz(
      interaction.user.id,
      hint.question.quiz.quizOwnerId,
      hasAdminPrivileges(interaction)
    );

    if (!userCanManage) {
      await interaction.reply({
        content: '❌ You can only edit hints in quizzes you own or have admin privileges for.',
        ephemeral: true,
      });
      return;
    }

    // Create modal for hint editing
    const modal = new ModalBuilder()
      .setCustomId(`edit_hint_modal_${hintId}`)
      .setTitle(`Edit Hint`);

    const titleInput = new TextInputBuilder()
      .setCustomId('hint_title')
      .setLabel('Hint Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter the hint title (e.g., "Grammar tip")')
      .setRequired(true)
      .setMaxLength(80)
      .setValue(hint.title);

    const textInput = new TextInputBuilder()
      .setCustomId('hint_text')
      .setLabel('Hint Content')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the hint content shown when clicked')
      .setRequired(true)
      .setMaxLength(2000)
      .setValue(hint.text);

    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);

    modal.addComponents(firstRow, secondRow);

    await interaction.showModal(modal);
  } catch (error) {
    logger.error('Error editing hint:', error);
    await interaction.reply({ content: '❌ Error editing hint.', ephemeral: true });
  }
}