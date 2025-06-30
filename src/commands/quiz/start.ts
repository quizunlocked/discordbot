import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { logger } from '@/utils/logger';
import { quizService } from '@/services/QuizService';
import { databaseService } from '@/services/DatabaseService';
import { QuizConfig } from '@/types';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const data = new SlashCommandBuilder()
  .setName('quiz')
  .setDescription('Start a new quiz session')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start a new quiz')
      .addStringOption(option =>
        option
          .setName('quiz_name')
          .setDescription('The name of the quiz to start')
          .setRequired(true)
          .addChoices(
            { name: 'General Knowledge', value: 'general-knowledge' },
            { name: 'Science Quiz', value: 'science-quiz' },
            { name: 'Technology Quiz', value: 'technology-quiz' }
          )
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
    const quizName = interaction.options.getString('quiz_name', true);
    const waitTime = interaction.options.getInteger('wait_time') || 30;
    const totalTimeLimit = interaction.options.getInteger('total_time_limit');
    
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

      // First, try to find an existing quiz in the database
      let existingQuiz = await databaseService.prisma.quiz.findFirst({
        where: {
          title: {
            contains: quizName.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())
          },
          isActive: true
        },
        include: { questions: true }
      });

      let quizConfig: QuizConfig;
      let quizId: string;

      if (existingQuiz && existingQuiz.questions.length > 0) {
        // Use existing quiz from database
        quizConfig = {
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
        quizId = existingQuiz.id;
        logger.info(`Using existing quiz from database: ${existingQuiz.title} (${quizId})`);
      } else {
        // Load quiz data from sample questions and create new quiz
        const loadedConfig = await loadQuizConfig(quizName);
        if (!loadedConfig) {
          await interaction.reply({
            content: `Quiz "${quizName}" not found. Available quizzes: general-knowledge, science-quiz, technology-quiz`,
            ephemeral: true,
          });
          return;
        }
        quizConfig = loadedConfig;

        // Generate unique quiz ID for new quiz
        quizId = uuidv4();
        logger.info(`Creating new quiz from sample data: ${quizConfig.title} (${quizId})`);
      }

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
        !existingQuiz // Only save to database if we're creating a new quiz
      );
      
      logger.info(`Quiz "${quizName}" started by ${interaction.user.tag} in ${interaction.guild?.name}`);
      
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
 * Load quiz configuration from sample data
 */
async function loadQuizConfig(quizName: string): Promise<QuizConfig | null> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'sample-questions.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    const quizMap: Record<string, QuizConfig> = {
      'general-knowledge': data.quizzes[0],
      'science-quiz': data.quizzes[1],
      'technology-quiz': data.quizzes[2],
    };
    
    return quizMap[quizName] || null;
  } catch (error) {
    logger.error('Error loading quiz config:', error);
    return null;
  }
} 