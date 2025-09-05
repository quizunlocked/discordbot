import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';
import { canManageQuiz, hasAdminPrivileges } from '../../utils/permissions.js';

export async function handleQuestionDelete(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const questionId = interaction.options.getString('question_id', true);

    // Find the question and its quiz
    const question = await databaseService.prisma.question.findUnique({
      where: { id: questionId },
      include: { 
        quiz: true,
        hints: true,
        attempts: true,
      },
    });

    if (!question) {
      await interaction.editReply('❌ Question not found.');
      return;
    }

    // Check if user can manage this quiz
    const userCanManage = canManageQuiz(
      interaction.user.id,
      question.quiz.quizOwnerId,
      hasAdminPrivileges(interaction)
    );

    if (!userCanManage) {
      await interaction.editReply(
        '❌ You can only delete questions from quizzes you own or have admin privileges for.'
      );
      return;
    }

    // Delete the question and all related data in a transaction
    await databaseService.prisma.$transaction(async (tx) => {
      // Delete question attempts first
      if (question.attempts.length > 0) {
        await tx.questionAttempt.deleteMany({
          where: { questionId: questionId },
        });
      }

      // Delete hints
      if (question.hints.length > 0) {
        await tx.hint.deleteMany({
          where: { questionId: questionId },
        });
      }

      // Finally delete the question
      await tx.question.delete({
        where: { id: questionId },
      });
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Question Deleted Successfully')
      .setDescription(`Deleted question from **${question.quiz.title}**`)
      .addFields(
        { name: 'Question ID', value: questionId, inline: true },
        { name: 'Quiz ID', value: question.quiz.id, inline: true },
        {
          name: 'Deleted Question',
          value: question.questionText.length > 100 
            ? question.questionText.substring(0, 97) + '...' 
            : question.questionText,
          inline: false,
        },
        { name: 'Hints Deleted', value: question.hints.length.toString(), inline: true },
        { name: 'Attempts Deleted', value: question.attempts.length.toString(), inline: true }
      )
      .setColor('#ff0000')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `Question "${question.questionText}" deleted from quiz "${question.quiz.title}" by ${interaction.user.tag}`
    );
  } catch (error) {
    logger.error('Error deleting question:', error);
    await interaction.editReply('❌ An error occurred while deleting the question. Please try again.');
  }
}