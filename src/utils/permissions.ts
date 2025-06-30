import { CommandInteraction, ButtonInteraction, PermissionFlagsBits } from 'discord.js';
import { logger } from './logger';

/**
 * Check if a user has administrator privileges
 * @param interaction - The command or button interaction
 * @returns true if user has admin privileges, false otherwise
 */
export function hasAdminPrivileges(interaction: CommandInteraction | ButtonInteraction): boolean {
  try {
    // Check if the interaction is from a guild (server)
    if (!interaction.guild || !interaction.member) {
      return false;
    }

    // Check if the user has administrator permissions
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  } catch (error) {
    logger.error('Error checking admin privileges:', error);
    return false;
  }
}

/**
 * Verify admin privileges and send error message if user lacks permissions
 * @param interaction - The command or button interaction
 * @returns true if user has admin privileges, false otherwise
 */
export async function requireAdminPrivileges(interaction: CommandInteraction | ButtonInteraction): Promise<boolean> {
  if (!hasAdminPrivileges(interaction)) {
    const errorMessage = '❌ **Access Denied**\n\nThis command requires administrator privileges. Only server administrators can perform this action.';
    
    if (interaction.isCommand()) {
      // Check if the interaction has already been deferred
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } else if (interaction.isButton()) {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
    
    const commandName = interaction.isCommand() ? interaction.commandName : interaction.customId;
    logger.warn(`User ${interaction.user.tag} attempted to use admin command without privileges: ${commandName}`);
    return false;
  }
  
  return true;
} 