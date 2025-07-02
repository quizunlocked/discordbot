import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { logger } from '@/utils/logger';
import { quizService } from '@/services/QuizService';
import { databaseService } from '@/services/DatabaseService';
import { QuizConfig } from '@/types';
import { canAccessQuiz } from '@/utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('quiz')
  .setDescription('Start a new quiz session')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start a new quiz')
      .addStringOption(option =>
        option
          .setName('quiz_id')
          .setDescription('The quiz to start (type to search)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(option =>
        option
          .setName('wait_time')
          .setDescription('Time to wait for participants to join (seconds)')
          .setRequired(false)
          .setMinValue(10)
          .setMaxValue(300)
      )
      .addIntegerOption(option =>
        option
          .setName('total_time_limit')
          .setDescription('Total time limit for the entire quiz (seconds)')
          .setRequired(false)
          .setMinValue(60)
          .setMaxValue(3600)
      )
      .addBooleanOption(option =>
        option
          .setName('private')
          .setDescription('Start this quiz as private (only you can participate)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('Stop the current quiz session')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'start') {
    const quizId = interaction.options.getString('quiz_id', true);
    const waitTime = interaction.options.getInteger('wait_time') || 30;
    const totalTimeLimit = interaction.options.getInteger('total_time_limit');
    const isPrivate = interaction.options.getBoolean('private') || false;
    
    try {
      // Check if there's already an active quiz in this channel
      const activeSession = quizService.getActiveSessionByChannel(interaction.channelId);
      if (activeSession) {
        await interaction.reply({
          content: 'There is already an active quiz in this channel. Please wait for it to finish.',
          ephemeral: true,
        });
        return;
      }

      // Find the quiz by ID in the database
      let existingQuiz = await databaseService.prisma.quiz.findUnique({
        where: { id: quizId },
        include: { questions: true }
      });

      if (!existingQuiz) {
        await interaction.reply({
          content: `Quiz not found. Please select a valid quiz.`,
          ephemeral: true,
        });
        return;
      }

      // Check access permissions for private quizzes
      if ((existingQuiz as any).private) {
        if (!canAccessQuiz(interaction.user.id, (existingQuiz as any).quizOwnerId, (existingQuiz as any).private)) {
          await interaction.reply({
            content: '❌ This is a private quiz. Only the creator can start it.',
            ephemeral: true,
          });
          return;
        }
      }

      let quizConfig: QuizConfig = {
        title: existingQuiz.title,
        description: existingQuiz.description || '',
        timeLimit: (existingQuiz as any).timeLimit,
        questions: existingQuiz.questions.map((q: any) => ({
          questionText: q.questionText,
          options: JSON.parse(q.options),
          correctAnswer: q.correctAnswer,
          points: q.points,
          timeLimit: q.timeLimit
        }))
      };

      // Add total time limit to quiz config if provided
      if (totalTimeLimit) {
        quizConfig.timeLimit = totalTimeLimit;
      }

      await interaction.reply({
        content: `Starting quiz: **${quizConfig.title}**\nGet ready to answer some questions!`,
        ephemeral: false,
      });
      
      // Start the quiz with waiting period
      await quizService.startQuiz(
        interaction.channel as any,
        quizConfig,
        quizId,
        waitTime,
        false, // Don't save to DB, already exists
        isPrivate,
        isPrivate ? interaction.user.id : undefined
      );
      
      logger.info(`Quiz "${quizConfig.title}" started by ${interaction.user.tag} in ${interaction.guild?.name}`);
      
    } catch (error) {
      logger.error('Error starting quiz:', error);
      await interaction.reply({
        content: 'There was an error starting the quiz. Please try again.',
        ephemeral: true,
      });
    }
  } else if (subcommand === 'stop') {
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
}

/**
 * Autocomplete handler for quiz_name/quiz_id
 */
export async function autocomplete(interaction: any) {
  if (!interaction.isAutocomplete()) return;
  const focusedValue = interaction.options.getFocused();
  // Fetch up to 25 quizzes matching the input
  const quizzes = await databaseService.prisma.quiz.findMany({
    where: {
      title: {
        contains: focusedValue,
      },
      isActive: true,
    },
    take: 25,
    orderBy: { createdAt: 'desc' },
  });
  await interaction.respond(
    quizzes.map(q => ({
      name: q.title,
      value: q.id,
    }))
  );
} 