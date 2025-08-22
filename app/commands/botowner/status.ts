import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { databaseService } from '../../services/DatabaseService.js';

export async function handleStatus(interaction: CommandInteraction): Promise<void> {
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
