import {
  SlashCommandBuilder,
  CommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';
import { quizService } from '../../services/QuizService.js';
import { buttonCleanupService } from '../../services/ButtonCleanupService.js';
import { requireAdminPrivileges } from '../../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin commands for managing the quiz bot')
  .addSubcommand(subcommand =>
    subcommand.setName('status').setDescription('Check bot status and database connection')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list-quizzes')
      .setDescription('List all available quizzes')
      .addBooleanOption(option =>
        option
          .setName('include_inactive')
          .setDescription('Include inactive quizzes')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('quiz-info')
      .setDescription('Get detailed information about a quiz')
      .addStringOption(option =>
        option.setName('quiz_id').setDescription('The ID of the quiz').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('toggle-quiz')
      .setDescription('Enable or disable a quiz')
      .addStringOption(option =>
        option.setName('quiz_id').setDescription('The ID of the quiz').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('user-stats')
      .setDescription('Get detailed statistics for a user')
      .addUserOption(option =>
        option.setName('user').setDescription('The user to get stats for').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('clear-user-data')
      .setDescription('Clear all data for a specific user')
      .addUserOption(option =>
        option.setName('user').setDescription('The user to clear data for').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('database-stats')
      .setDescription('Get database statistics and health information')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop-active-quiz')
      .setDescription('Stop any active quiz in the current channel')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();

  try {
    await interaction.deferReply({ ephemeral: true });

    // Validate channel type - admin commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.editReply({
        content: '❌ Admin commands can only be used in server channels, not in direct messages.',
      });
      return;
    }

    switch (subcommand) {
      case 'status':
        await handleStatus(interaction);
        break;
      case 'list-quizzes':
        await handleListQuizzes(interaction);
        break;
      case 'quiz-info':
        await handleQuizInfo(interaction);
        break;
      case 'toggle-quiz':
        await handleToggleQuiz(interaction);
        break;
      case 'user-stats':
        await handleUserStats(interaction);
        break;
      case 'clear-user-data':
        if (!(await requireAdminPrivileges(interaction))) return;
        await handleClearUserData(interaction);
        break;
      case 'database-stats':
        await handleDatabaseStats(interaction);
        break;
      case 'stop-active-quiz':
        await handleStopActiveQuiz(interaction);
        break;
      default:
        await interaction.editReply('Unknown subcommand.');
    }
  } catch (error) {
    logger.error('Error in admin command:', error);
    await interaction.editReply({
      content: 'There was an error executing the admin command. Please check the logs.',
    });
  }
}

async function handleStatus(interaction: CommandInteraction): Promise<void> {
  try {
    // Test database connection
    const dbTest = await databaseService.prisma.$queryRaw`SELECT 1 as test`;
    const dbStatus = dbTest ? '✅ Connected' : '❌ Disconnected';

    // Get bot uptime
    const uptime = process.uptime();
    const uptimeFormatted = formatUptime(uptime);

    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const memoryFormatted = `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`;

    const embed = new EmbedBuilder()
      .setTitle('🤖 Bot Status')
      .setColor('#00ff00')
      .addFields(
        { name: 'Database', value: dbStatus, inline: true },
        { name: 'Uptime', value: uptimeFormatted, inline: true },
        { name: 'Memory Usage', value: memoryFormatted, inline: true },
        { name: 'Node.js Version', value: process.version, inline: true },
        { name: 'Environment', value: process.env['NODE_ENV'] || 'development', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error checking status:', error);
    await interaction.editReply('❌ Error checking bot status.');
  }
}

async function handleListQuizzes(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const includeInactive = interaction.options.getBoolean('include_inactive') ?? true; // Default to true to show all quizzes

    const quizzes = await databaseService.prisma.quiz.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: {
          select: {
            questions: true,
            attempts: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (quizzes.length === 0) {
      await interaction.editReply('No quizzes found.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📚 Available Quizzes')
      .setColor('#0099ff')
      .setDescription(
        quizzes
          .map(quiz => {
            const status = quiz.isActive ? '🟢 Active' : '🔴 Inactive';
            return `**${quiz.title}** (${quiz.id})\n${status} • ${quiz._count.questions} questions • ${quiz._count.attempts} attempts`;
          })
          .join('\n\n')
      )
      .setTimestamp();

    // Add note about inactive quizzes if showing all
    if (includeInactive) {
      embed.setFooter({
        text: 'Showing all quizzes (active and inactive). Use /admin list-quizzes include_inactive:false to show only active quizzes.',
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error listing quizzes:', error);
    await interaction.editReply('❌ Error listing quizzes.');
  }
}

async function handleQuizInfo(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: true,
        attempts: {
          include: {
            user: true,
            questionAttempts: true,
          },
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            questions: true,
            attempts: true,
          },
        },
      },
    });

    if (!quiz) {
      await interaction.editReply('❌ Quiz not found.');
      return;
    }

    // Calculate statistics
    const totalParticipants = new Set(quiz.attempts.map(a => a.userId)).size;
    const averageScore =
      quiz.attempts.length > 0
        ? Math.round(quiz.attempts.reduce((sum, a) => sum + a.totalScore, 0) / quiz.attempts.length)
        : 0;

    const embed = new EmbedBuilder()
      .setTitle(`📊 Quiz Information: ${quiz.title}`)
      .setDescription(quiz.description || 'No description available')
      .setColor(quiz.isActive ? '#00ff00' : '#ff0000')
      .addFields(
        { name: 'Status', value: quiz.isActive ? '🟢 Active' : '🔴 Inactive', inline: true },
        { name: 'Questions', value: quiz._count.questions.toString(), inline: true },
        { name: 'Total Attempts', value: quiz._count.attempts.toString(), inline: true },
        { name: 'Unique Participants', value: totalParticipants.toString(), inline: true },
        { name: 'Average Score', value: averageScore.toString(), inline: true },
        { name: 'Created', value: quiz.createdAt.toLocaleDateString(), inline: true }
      )
      .setTimestamp();

    if (quiz.questions.length > 0) {
      const questionsText = quiz.questions
        .map(
          (q, i) =>
            `${i + 1}. ${q.questionText.substring(0, 50)}${q.questionText.length > 50 ? '...' : ''}`
        )
        .join('\n');

      embed.addFields({
        name: 'Questions Preview',
        value: questionsText.substring(0, 1024) + (questionsText.length > 1024 ? '...' : ''),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting quiz info:', error);
    await interaction.editReply('❌ Error getting quiz information.');
  }
}

async function handleToggleQuiz(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const quizId = interaction.options.getString('quiz_id', true);

    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
    });

    if (!quiz) {
      await interaction.editReply('❌ Quiz not found.');
      return;
    }

    const newStatus = !quiz.isActive;

    await databaseService.prisma.quiz.update({
      where: { id: quizId },
      data: { isActive: newStatus },
    });

    const embed = new EmbedBuilder()
      .setTitle('🔄 Quiz Status Updated')
      .setDescription(`**${quiz.title}** is now ${newStatus ? '🟢 Active' : '🔴 Inactive'}`)
      .setColor(newStatus ? '#00ff00' : '#ff0000')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error toggling quiz:', error);
    await interaction.editReply('❌ Error updating quiz status.');
  }
}

async function handleUserStats(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const user = interaction.options.getUser('user', true);

    // Get user data
    const userData = await databaseService.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        quizAttempts: {
          include: {
            quiz: true,
            questionAttempts: true,
          },
          orderBy: { startedAt: 'desc' },
        },
        scores: {
          orderBy: { year: 'desc' },
        },
      },
    });

    if (!userData) {
      await interaction.editReply('❌ User not found in database.');
      return;
    }

    // Calculate statistics
    const totalQuizzes = userData.quizAttempts.length;
    const totalScore = userData.quizAttempts.reduce((sum, a) => sum + a.totalScore, 0);
    const averageScore = totalQuizzes > 0 ? Math.round(totalScore / totalQuizzes) : 0;
    const correctAnswers = userData.quizAttempts.reduce(
      (sum, a) => sum + a.questionAttempts.filter(qa => qa.isCorrect).length,
      0
    );
    const totalAnswers = userData.quizAttempts.reduce(
      (sum, a) => sum + a.questionAttempts.length,
      0
    );
    const successRate = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle(`📊 User Statistics: ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .setColor('#0099ff')
      .addFields(
        { name: 'Total Quizzes', value: totalQuizzes.toString(), inline: true },
        { name: 'Total Score', value: totalScore.toString(), inline: true },
        { name: 'Average Score', value: averageScore.toString(), inline: true },
        { name: 'Correct Answers', value: correctAnswers.toString(), inline: true },
        { name: 'Total Answers', value: totalAnswers.toString(), inline: true },
        { name: 'Success Rate', value: `${successRate}%`, inline: true }
      )
      .setTimestamp();

    // Add recent quiz attempts
    if (userData.quizAttempts.length > 0) {
      const recentAttempts = userData.quizAttempts
        .slice(0, 5)
        .map(a => `${a.quiz.title}: ${a.totalScore} pts (${a.startedAt.toLocaleDateString()})`)
        .join('\n');

      embed.addFields({
        name: 'Recent Quiz Attempts',
        value: recentAttempts,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting user stats:', error);
    await interaction.editReply('❌ Error getting user statistics.');
  }
}

async function handleClearUserData(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;

    const user = interaction.options.getUser('user', true);

    // Create confirmation buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`admin_clear_user_confirm_${user.id}`)
        .setLabel('✅ Confirm')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`admin_clear_user_cancel_${user.id}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirm User Data Deletion')
      .setDescription(
        `Are you sure you want to delete all data for **${user.username}**?\n\nThis action will permanently delete:\n• All quiz attempts\n• All scores and statistics\n• All question attempts\n\n**This action cannot be undone!**`
      )
      .setColor('#ff0000')
      .setTimestamp();

    const reply = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    // Schedule button cleanup
    buttonCleanupService.scheduleAdminCleanup(reply.id, interaction.channelId, 60);
  } catch (error) {
    logger.error('Error preparing user data deletion:', error);
    await interaction.editReply('❌ Error preparing user data deletion.');
  }
}

async function handleDatabaseStats(interaction: CommandInteraction): Promise<void> {
  try {
    // Get database statistics
    const [userCount, quizCount, questionCount, attemptCount, scoreCount] = await Promise.all([
      databaseService.prisma.user.count(),
      databaseService.prisma.quiz.count(),
      databaseService.prisma.question.count(),
      databaseService.prisma.quizAttempt.count(),
      databaseService.prisma.score.count(),
    ]);

    // Get recent activity
    const recentAttempts = await databaseService.prisma.quizAttempt.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' },
      include: {
        user: true,
        quiz: true,
      },
    });

    const embed = new EmbedBuilder()
      .setTitle('🗄️ Database Statistics')
      .setColor('#0099ff')
      .addFields(
        { name: 'Users', value: userCount.toString(), inline: true },
        { name: 'Quizzes', value: quizCount.toString(), inline: true },
        { name: 'Questions', value: questionCount.toString(), inline: true },
        { name: 'Quiz Attempts', value: attemptCount.toString(), inline: true },
        { name: 'Score Records', value: scoreCount.toString(), inline: true }
      )
      .setTimestamp();

    if (recentAttempts.length > 0) {
      const recentActivity = recentAttempts
        .map(a => `${a.user.username}: ${a.quiz.title} (${a.totalScore} pts)`)
        .join('\n');

      embed.addFields({
        name: 'Recent Activity',
        value: recentActivity,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting database stats:', error);
    await interaction.editReply('❌ Error getting database statistics.');
  }
}

async function handleStopActiveQuiz(interaction: CommandInteraction): Promise<void> {
  try {
    const activeSession = quizService.getActiveSessionByChannel(interaction.channelId);

    if (!activeSession) {
      await interaction.editReply('❌ No active quiz found in this channel.');
      return;
    }

    await quizService.stopQuiz(activeSession.id);

    const embed = new EmbedBuilder()
      .setTitle('🛑 Quiz Stopped')
      .setDescription('The active quiz has been stopped by an administrator.')
      .setColor('#ff0000')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error stopping active quiz:', error);
    await interaction.editReply('❌ Error stopping active quiz.');
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}
