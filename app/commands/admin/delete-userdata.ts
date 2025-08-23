import {
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { buttonCleanupService } from '../../services/ButtonCleanupService.js';

export async function handleDeleteUserdata(interaction: CommandInteraction): Promise<void> {
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
