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

export async function handleQuestionAdd(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    // Check if quiz exists and user has permission
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
        content: '❌ You can only add questions to quizzes you own or have admin privileges for.',
        ephemeral: true,
      });
      return;
    }

    // Create modal for question creation
    const modal = new ModalBuilder()
      .setCustomId(`add_question_modal_${quizId}`)
      .setTitle(`Add Question to: ${quiz.title}`);

    const questionInput = new TextInputBuilder()
      .setCustomId('question_text')
      .setLabel('Question Text')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the question text')
      .setRequired(true)
      .setMaxLength(1000);

    const optionsInput = new TextInputBuilder()
      .setCustomId('question_options')
      .setLabel('Answer Options (one per line)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Option 1\nOption 2\nOption 3\nOption 4')
      .setRequired(true)
      .setMaxLength(1000);

    const correctAnswerInput = new TextInputBuilder()
      .setCustomId('correct_answer')
      .setLabel('Correct Answer Index (0-based)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('0 (for first option, 1 for second, etc.)')
      .setRequired(true)
      .setMaxLength(2);

    const timeLimitInput = new TextInputBuilder()
      .setCustomId('time_limit')
      .setLabel('Time Limit (seconds, optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('30')
      .setRequired(false)
      .setMaxLength(3);

    const pointsInput = new TextInputBuilder()
      .setCustomId('points')
      .setLabel('Points (optional, default: 10)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('10')
      .setRequired(false)
      .setMaxLength(3);

    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(optionsInput);
    const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(correctAnswerInput);
    const fourthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(timeLimitInput);
    const fifthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(pointsInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    await interaction.showModal(modal);
  } catch (error) {
    logger.error('Error adding question:', error);
    await interaction.reply({ content: '❌ Error adding question.', ephemeral: true });
  }
}
