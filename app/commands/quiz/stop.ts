import { CommandInteraction } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { quizService } from '../../services/QuizService.js';

export async function handleStop(interaction: CommandInteraction): Promise<void> {
  try {
    // Check if there's an active quiz in this channel
    const activeSession = quizService.getActiveSessionByChannel(interaction.channelId);
    if (!activeSession) {
      await interaction.reply({
        content: 'There is no active quiz in this channel.',
        ephemeral: true,
      });
      return;
    }

    // Stop the quiz
    await quizService.stopQuiz(activeSession.id);

    await interaction.reply({
      content: '✅ Quiz has been stopped.',
      ephemeral: false,
    });

    logger.info(`Quiz stopped by ${interaction.user.tag} in ${interaction.guild?.name}`);
  } catch (error) {
    logger.error('Error stopping quiz:', error);
    await interaction.reply({
      content: 'There was an error stopping the quiz. Please try again.',
      ephemeral: true,
    });
  }
}
