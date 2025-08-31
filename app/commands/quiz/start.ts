import { CommandInteraction } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { quizService } from '../../services/QuizService.js';
import { databaseService } from '../../services/DatabaseService.js';
import { QuizConfig } from '../../types/index.js';
import { canAccessQuiz } from '../../utils/permissions.js';

export async function handleStart(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  const quizId = interaction.options.getString('quiz_id', true);
  const waitTime = interaction.options.getInteger('wait_time') || 30;
  const totalTimeLimit = interaction.options.getInteger('total_time_limit');
  const isPrivate = interaction.options.getBoolean('private') || false;

  try {
    // Check if there's already an active quiz in this channel
    const activeSession = quizService.getActiveSessionByChannel(interaction.channelId);
    if (activeSession) {
      await interaction.editReply(
        'There is already an active quiz in this channel. Please wait for it to finish.'
      );
      return;
    }

    // Find the quiz by ID in the database
    const existingQuiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });

    if (!existingQuiz) {
      await interaction.editReply(`Quiz not found. Please select a valid quiz.`);
      return;
    }

    // Check access permissions for private quizzes
    if ((existingQuiz as any).private) {
      if (
        !canAccessQuiz(
          interaction.user.id,
          (existingQuiz as any).quizOwnerId,
          (existingQuiz as any).private
        )
      ) {
        await interaction.editReply('❌ This is a private quiz. Only the creator can start it.');
        return;
      }
    }

    const quizConfig: QuizConfig = {
      title: existingQuiz.title,
      description: existingQuiz.description || '',
      timeLimit: (existingQuiz as any).timeLimit,
      questions: existingQuiz.questions.map((q: any) => ({
        questionText: q.questionText,
        options: JSON.parse(q.options),
        correctAnswer: q.correctAnswer,
        points: q.points,
        timeLimit: q.timeLimit,
      })),
    };

    // Add total time limit to quiz config if provided
    if (totalTimeLimit) {
      quizConfig.timeLimit = totalTimeLimit;
    }

    await interaction.editReply(
      `Starting quiz: **${quizConfig.title}**\nGet ready to answer some questions!`
    );

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

    logger.info(
      `Quiz "${quizConfig.title}" started by ${interaction.user.tag} in ${interaction.guild?.name}`
    );
  } catch (error) {
    logger.error('Error starting quiz:', error);
    await interaction.editReply('There was an error starting the quiz. Please try again.');
  }
}

/**
 * Autocomplete handler for quiz_id
 */
export async function handleStartAutocomplete(interaction: any) {
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
