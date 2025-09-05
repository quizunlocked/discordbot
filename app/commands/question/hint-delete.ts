import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';
import { canManageQuiz, hasAdminPrivileges } from '../../utils/permissions.js';

export async function handleHintDelete(interaction: CommandInteraction): Promise<void> {
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
      await interaction.editReply('❌ Hint not found.');
      return;
    }

    // Check if user can manage this quiz
    const userCanManage = canManageQuiz(
      interaction.user.id,
      hint.question.quiz.quizOwnerId,
      hasAdminPrivileges(interaction)
    );

    if (!userCanManage) {
      await interaction.editReply(
        '❌ You can only delete hints from quizzes you own or have admin privileges for.'
      );
      return;
    }

    // Delete the hint
    await databaseService.prisma.hint.delete({
      where: { id: hintId },
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Hint Deleted Successfully')
      .setDescription(`Deleted hint from question in **${hint.question.quiz.title}**`)
      .addFields(
        { name: 'Hint ID', value: hintId, inline: true },
        { name: 'Question ID', value: hint.question.id, inline: true },
        { name: 'Quiz ID', value: hint.question.quiz.id, inline: true },
        {
          name: 'Question Text',
          value: hint.question.questionText.length > 100 
            ? hint.question.questionText.substring(0, 97) + '...' 
            : hint.question.questionText,
          inline: false,
        },
        { name: 'Deleted Hint Title', value: hint.title, inline: true },
        {
          name: 'Deleted Hint Text',
          value: hint.text.length > 100 
            ? hint.text.substring(0, 97) + '...' 
            : hint.text,
          inline: false,
        }
      )
      .setColor('#ff0000')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `Hint "${hint.title}" deleted from question in quiz "${hint.question.quiz.title}" by ${interaction.user.tag}`
    );
  } catch (error) {
    logger.error('Error deleting hint:', error);
    await interaction.editReply('❌ An error occurred while deleting the hint. Please try again.');
  }
}