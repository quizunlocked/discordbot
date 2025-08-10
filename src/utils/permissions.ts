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
export async function requireAdminPrivileges(
  interaction: CommandInteraction | ButtonInteraction
): Promise<boolean> {
  if (!hasAdminPrivileges(interaction)) {
    const errorMessage =
      '❌ **Access Denied**\n\nThis command requires administrator privileges. Only server administrators can perform this action.';

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
    logger.warn(
      `User ${interaction.user.tag} attempted to use admin command without privileges: ${commandName}`
    );
    return false;
  }

  return true;
}

/**
 * Check if a user can access a quiz (public quizzes or private quizzes owned by the user)
 * @param userId - The ID of the user trying to access the quiz
 * @param quizOwnerId - The ID of the quiz owner (null for public quizzes)
 * @param isPrivate - Whether the quiz is private
 * @returns true if user can access the quiz, false otherwise
 */
export function canAccessQuiz(
  userId: string,
  quizOwnerId: string | null,
  isPrivate: boolean
): boolean {
  // Public quizzes can be accessed by anyone
  if (!isPrivate) {
    return true;
  }

  // Private quizzes can only be accessed by their owner
  return quizOwnerId === userId;
}

/**
 * Check if a user is the owner of a quiz
 * @param userId - The ID of the user to check
 * @param quizOwnerId - The ID of the quiz owner
 * @returns true if user is the quiz owner, false otherwise
 */
export function isQuizOwner(userId: string, quizOwnerId: string | null): boolean {
  return quizOwnerId === userId;
}

/**
 * Check if a user can manage a quiz (owner or admin)
 * @param userId - The ID of the user trying to manage the quiz
 * @param quizOwnerId - The ID of the quiz owner
 * @param hasAdminPrivileges - Whether the user has admin privileges
 * @returns true if user can manage the quiz, false otherwise
 */
export function canManageQuiz(
  userId: string,
  quizOwnerId: string | null,
  hasAdminPrivileges: boolean
): boolean {
  // Admins can manage any quiz
  if (hasAdminPrivileges) {
    return true;
  }

  // Quiz owners can manage their own quizzes
  return isQuizOwner(userId, quizOwnerId);
}
