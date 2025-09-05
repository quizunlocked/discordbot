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

export async function handleQuestionEdit(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const questionId = interaction.options.getString('question_id', true);

    // Find the question and its quiz
    const question = await databaseService.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        quiz: true,
      },
    });

    if (!question) {
      await interaction.reply({ content: '❌ Question not found.', ephemeral: true });
      return;
    }

    // Check if user can manage this quiz
    const userCanManage = canManageQuiz(
      interaction.user.id,
      question.quiz.quizOwnerId,
      hasAdminPrivileges(interaction)
    );

    if (!userCanManage) {
      await interaction.reply({
        content: '❌ You can only edit questions in quizzes you own or have admin privileges for.',
        ephemeral: true,
      });
      return;
    }

    // Parse existing options
    const currentOptions = JSON.parse(question.options) as string[];

    // Create modal for question editing
    const modal = new ModalBuilder()
      .setCustomId(`edit_question_modal_${questionId}`)
      .setTitle(`Edit Question`);

    const questionInput = new TextInputBuilder()
      .setCustomId('question_text')
      .setLabel('Question Text')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the question text')
      .setRequired(true)
      .setMaxLength(1000)
      .setValue(question.questionText);

    const optionsInput = new TextInputBuilder()
      .setCustomId('question_options')
      .setLabel('Answer Options (one per line)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Option 1\nOption 2\nOption 3\nOption 4')
      .setRequired(true)
      .setMaxLength(1000)
      .setValue(currentOptions.join('\n'));

    const correctAnswerInput = new TextInputBuilder()
      .setCustomId('correct_answer')
      .setLabel('Correct Answer Index (0-based)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('0 (for first option, 1 for second, etc.)')
      .setRequired(true)
      .setMaxLength(2)
      .setValue(question.correctAnswer.toString());

    const timeLimitInput = new TextInputBuilder()
      .setCustomId('time_limit')
      .setLabel('Time Limit (seconds, optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('30')
      .setRequired(false)
      .setMaxLength(3)
      .setValue(question.timeLimit?.toString() || '');

    const pointsInput = new TextInputBuilder()
      .setCustomId('points')
      .setLabel('Points (optional, default: 10)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('10')
      .setRequired(false)
      .setMaxLength(3)
      .setValue(question.points.toString());

    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(optionsInput);
    const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(correctAnswerInput);
    const fourthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(timeLimitInput);
    const fifthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(pointsInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    await interaction.showModal(modal);
  } catch (error) {
    logger.error('Error editing question:', error);
    await interaction.reply({ content: '❌ Error editing question.', ephemeral: true });
  }
}
