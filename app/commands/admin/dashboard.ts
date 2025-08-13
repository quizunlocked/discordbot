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

export const data = new SlashCommandBuilder()
  .setName('dashboard')
  .setDescription('Admin dashboard with bot overview and quick actions')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply({ ephemeral: true });

    // Validate channel type - admin commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.editReply({
        content: '❌ Admin commands can only be used in server channels, not in direct messages.',
      });
      return;
    }

    // Get comprehensive statistics
    const [
      userCount,
      quizCount,
      questionCount,
      attemptCount,
      scoreCount,
      activeQuizzes,
      recentAttempts,
    ] = await Promise.all([
      databaseService.prisma.user.count(),
      databaseService.prisma.quiz.count(),
      databaseService.prisma.question.count(),
      databaseService.prisma.quizAttempt.count(),
      databaseService.prisma.score.count(),
      databaseService.prisma.quiz.count({ where: { isActive: true } }),
      databaseService.prisma.quizAttempt.findMany({
        take: 5,
        orderBy: { startedAt: 'desc' },
        include: {
          user: true,
          quiz: true,
        },
      }),
    ]);

    // Get bot status
    const uptime = process.uptime();
    const uptimeFormatted = formatUptime(uptime);
    const memoryUsage = process.memoryUsage();
    const memoryFormatted = `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`;

    // Test database connection
    const dbTest = await databaseService.prisma.$queryRaw`SELECT 1 as test`;
    const dbStatus = dbTest ? '✅ Connected' : '❌ Disconnected';

    // Get active quiz sessions
    const activeSessions = quizService.getActiveSessionByChannel(interaction.channelId);

    const embed = new EmbedBuilder()
      .setTitle('🤖 Admin Dashboard')
      .setDescription('Comprehensive overview of the quiz bot system')
      .setColor('#0099ff')
      .addFields(
        { name: '🟢 System Status', value: 'All systems operational', inline: false },
        { name: 'Database', value: dbStatus, inline: true },
        { name: 'Uptime', value: uptimeFormatted, inline: true },
        { name: 'Memory', value: memoryFormatted, inline: true },
        { name: '📊 Statistics', value: 'System usage and activity', inline: false },
        { name: 'Users', value: userCount.toString(), inline: true },
        { name: 'Quizzes', value: `${activeQuizzes}/${quizCount} active`, inline: true },
        { name: 'Questions', value: questionCount.toString(), inline: true },
        { name: 'Attempts', value: attemptCount.toString(), inline: true },
        { name: 'Score Records', value: scoreCount.toString(), inline: true },
        {
          name: 'Active Sessions',
          value: activeSessions ? '1 in this channel' : 'None',
          inline: true,
        }
      )
      .setTimestamp();

    // Add recent activity if any
    if (recentAttempts.length > 0) {
      const recentActivity = recentAttempts
        .map(a => `${a.user.username}: ${a.quiz.title} (${a.totalScore} pts)`)
        .join('\n');

      embed.addFields({
        name: '📈 Recent Activity',
        value: recentActivity,
        inline: false,
      });
    }

    // Create quick action buttons
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('dashboard_status')
        .setLabel('System Status')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('dashboard_quizzes')
        .setLabel('Manage Quizzes')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('dashboard_users')
        .setLabel('User Management')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('dashboard_database')
        .setLabel('Database Stats')
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('dashboard_create_quiz')
        .setLabel('Create Quiz')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('dashboard_stop_quiz')
        .setLabel('Stop Active Quiz')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!activeSessions)
    );

    const reply = await interaction.editReply({
      embeds: [embed],
      components: [row1, row2],
    });

    // Schedule button cleanup for dashboard (5 minutes)
    buttonCleanupService.scheduleAdminCleanup(reply.id, interaction.channelId, 300);
  } catch (error) {
    logger.error('Error in dashboard command:', error);
    await interaction.editReply({
      content: 'There was an error loading the dashboard. Please check the logs.',
    });
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
