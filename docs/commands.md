# Command Reference

Quiz Unlocked provides a comprehensive set of slash commands to manage quizzes, track performance, and administer your Discord community. All commands use Discord's modern slash command interface for better discoverability and user experience.

## 🎮 Quiz Commands

Commands for creating, managing, and running quiz sessions.

### `/quiz start`

Start a quiz session in the current channel.

**Parameters:**

- `quiz-title` (required) - The name of the quiz to start
- `private` (optional) - Set to true for single-user quiz mode

**Usage:**

```
/quiz start quiz-title:"Geography Quiz"
/quiz start quiz-title:"Math Practice" private:true
```

**Behavior:**

- Only one quiz can run per channel at a time
- Participants join by clicking answer buttons
- Quiz automatically ends when all questions are answered
- Results and leaderboard are displayed upon completion

**Cooldown:** 10 seconds

---

### `/quiz stop`

Stop the currently running quiz in the channel.

**Usage:**

```
/quiz stop
```

**Behavior:**

- Immediately ends the active quiz session
- Displays partial results if any questions were answered
- Clears quiz state and allows starting a new quiz
- Only quiz participants or server admins can stop quizzes

**Cooldown:** 5 seconds

---

### `/quiz create`

Create a new quiz using an interactive form interface.

**Usage:**

```
/quiz create
```

**Behavior:**

- Opens Discord's modal form interface
- Allows adding questions one by one
- Supports multiple choice answers (2-10 options)
- Configurable point values and time limits per question
- Saves quiz for future use

**Cooldown:** 30 seconds

---

### `/quiz upload`

Create a quiz by uploading a CSV file.

**Parameters:**

- `title` (required) - Name for your new quiz
- `file` (required) - CSV file containing quiz data
- `private` (optional) - Whether the quiz should be private to you

**Usage:**

```
/quiz upload title:"History Quiz" file:[attach CSV]
/quiz upload title:"Private Study" file:[attach CSV] private:true
```

**CSV Format:**

```csv
questionText,options,correctAnswer,points,timeLimit
"What is 2+2?","[""3"",""4"",""5""]",1,10,30
"Capital of France?","[""London"",""Paris"",""Madrid""]",1,15,45
```

**Validation Rules:**

- Maximum 25MB file size
- Maximum 100 questions per quiz
- Options must be valid JSON array with 2-10 choices
- Points must be 1-100 (default: 10)
- Time limit must be 10-300 seconds (default: 30)

**Cooldown:** 60 seconds

---

### `/quiz template`

Download a CSV template for creating custom quizzes.

**Usage:**

```
/quiz template
```

**Behavior:**

- Sends a downloadable CSV file with example questions
- Includes detailed instructions for CSV format
- Template demonstrates proper JSON formatting for options
- Includes examples of different point values and time limits

**Cooldown:** 5 seconds

---

### `/quiz generate`

Generate a randomized quiz from a corpus (question bank).

**Parameters:**

- `from-corpus` (required) - Name of the corpus to use
- `quiz-title` (required) - Name for the generated quiz  
- `num-questions` (required) - Number of questions to generate (1-100)
- `num-choices` (optional) - Number of answer choices per question (2-10, default: 4)
- `show-hints` (optional) - Whether to include hints (default: true)
- `private` (optional) - Whether the quiz should be private (default: false)
- `question-time-limit` (optional) - Time limit per question in seconds (10-300)

**Usage:**

```
/quiz generate from-corpus:"Polish Vocabulary" quiz-title:"Daily Practice" num-questions:15
/quiz generate from-corpus:"History Facts" quiz-title:"Quick Review" num-questions:5 num-choices:3 show-hints:false
```

**Behavior:**

- Randomly selects questions from the specified corpus
- Generates incorrect answers from other corpus entries with matching tags
- Creates a new quiz that can be started like any uploaded quiz
- Supports all the same features as manually created quizzes

**Cooldown:** 30 seconds

---

### `/quiz edit`

Edit an existing quiz that you own.

**Parameters:**

- `quiz-id` (required) - ID of the quiz to edit

**Usage:**

```
/quiz edit quiz-id:"abc123"
```

**Behavior:**

- Opens interactive editing interface
- Allows modifying questions, answers, points, and time limits
- Only quiz owners can edit their quizzes
- Changes take effect immediately for future quiz sessions

**Cooldown:** 30 seconds

---

### `/quiz delete`

Delete a quiz that you own.

**Parameters:**

- `quiz-id` (required) - ID of the quiz to delete

**Usage:**

```
/quiz delete quiz-id:"abc123"
```

**Behavior:**

- Permanently removes the quiz and all associated data
- Requires confirmation before deletion
- Only quiz owners can delete their quizzes
- Cannot be undone

**Cooldown:** 10 seconds

---

### `/quiz get`

View details about a specific quiz.

**Parameters:**

- `quiz-title` (required) - Name of the quiz to view

**Usage:**

```
/quiz get quiz-title:"Geography Quiz"
```

**Behavior:**

- Shows quiz metadata (title, number of questions, creator)
- Displays first few questions as preview
- Shows point values and time limits
- Available for both public and owned private quizzes

**Cooldown:** 5 seconds

## 📊 Statistics and Leaderboards

Commands for tracking performance and viewing rankings.

### `/leaderboard`

View server leaderboards for different time periods.

**Parameters:**

- `period` (optional) - Time period to view (weekly/monthly/yearly/overall, default: overall)
- `page` (optional) - Page number for large leaderboards (default: 1)

**Usage:**

```
/leaderboard
/leaderboard period:weekly
/leaderboard period:monthly page:2
```

**Behavior:**

- Shows top performers for the selected time period
- Displays total score, average score, and response times
- Updates in real-time as users complete quizzes
- Supports pagination for servers with many active users

**Cooldown:** 5 seconds

---

### `/stats`

View your own quiz performance statistics.

**Parameters:**

- `user` (optional) - Another user to view stats for

**Usage:**

```
/stats
/stats user:@username
```

**Behavior:**

- Shows comprehensive performance metrics:
  - Total score and quizzes taken
  - Success rate based on correct answers
  - Average response time
  - Current server ranking
  - Best completion time
- Calculates success rate using actual question attempts (not assumptions)
- Available for any server member

**Cooldown:** 5 seconds

## 🏗️ Content Management

Commands for managing question banks and media content.

### `/corpus upload`

Upload a CSV file to create a question bank (corpus).

**Parameters:**

- `title` (required) - Name for your corpus
- `file` (required) - CSV file containing question bank data

**Usage:**

```
/corpus upload title:"Polish Vocabulary" file:[attach corpus CSV]
```

**Corpus CSV Format:**

```csv
tags,questionVariants,answerVariants,hintTitles,hintVariants
"basic,greetings","[""What is hello?"",""How to say hello?""]","[""Cześć"",""Dzień dobry""]","[""Pronunciation""]","{""Pronunciation"":[""CHESH-ch""]}"
```

**Behavior:**

- Creates reusable question banks for quiz generation
- Supports multiple question and answer variants per entry
- Allows tagging for organized content categorization
- Enables hint systems for educational contexts

**Cooldown:** 60 seconds

---

### `/corpus template`

Download a CSV template for creating question banks.

**Usage:**

```
/corpus template
```

**Behavior:**

- Provides detailed template with examples
- Includes comprehensive formatting instructions
- Shows advanced features like hints and tags

**Cooldown:** 5 seconds

---

### `/image upload`

Upload images to use in quiz questions.

**Parameters:**

- `file` (required) - Image file to upload
- `title` (optional) - Descriptive title for the image
- `alt-text` (optional) - Accessibility description

**Usage:**

```
/image upload file:[attach image] title:"France Map" alt-text:"Map showing France in Europe"
```

**Supported Formats:**

- PNG, JPG, JPEG, GIF
- Maximum 25MB file size
- Automatically generates unique IDs for CSV reference

**Cooldown:** 30 seconds

---

### `/image delete`

Delete an uploaded image.

**Parameters:**

- `image-id` (required) - ID of the image to delete

**Usage:**

```
/image delete image-id:"img_abc123"
```

**Behavior:**

- Removes image file and database record
- Only image owners can delete their uploads
- Cannot be undone

**Cooldown:** 10 seconds

## 🔧 Administrative Commands

Commands for server administrators to manage bot functionality.

::: warning Admin Permissions Required
These commands require "Manage Server" permissions or equivalent admin roles configured in your server.
:::

### `/admin list-quizzes`

View all quizzes available on the server.

**Usage:**

```
/admin list-quizzes
```

**Behavior:**

- Shows all public and private quizzes
- Displays creator, creation date, and status
- Allows admins to see community quiz activity

**Cooldown:** 10 seconds

---

### `/admin list-corpora`

View all question banks (corpora) on the server.

**Usage:**

```
/admin list-corpora
```

**Behavior:**

- Lists all uploaded question banks
- Shows creator and entry count information
- Helps admins understand available content

**Cooldown:** 10 seconds

---

### `/admin toggle-quiz`

Enable or disable a specific quiz.

**Parameters:**

- `quiz-id` (required) - ID of the quiz to toggle
- `active` (required) - Whether the quiz should be active

**Usage:**

```
/admin toggle-quiz quiz-id:"abc123" active:false
```

**Behavior:**

- Temporarily disables problematic quizzes
- Disabled quizzes cannot be started but remain in database
- Useful for content moderation

**Cooldown:** 10 seconds

---

### `/admin delete-userdata`

Delete all data associated with a specific user.

**Parameters:**

- `user` (required) - User whose data should be deleted
- `confirm` (required) - Type "DELETE" to confirm

**Usage:**

```
/admin delete-userdata user:@username confirm:DELETE
```

**Behavior:**

- Removes all quiz attempts, scores, and created content
- Irreversible operation requiring explicit confirmation
- Used for privacy compliance and user requests

**Cooldown:** 30 seconds

---

### `/admin delete-everything`

Delete all bot data from the server.

**Parameters:**

- `confirm` (required) - Type "DELETE EVERYTHING" to confirm

**Usage:**

```
/admin delete-everything confirm:"DELETE EVERYTHING"
```

**Behavior:**

- Complete database reset for the server
- Removes all quizzes, attempts, scores, and user data
- Extremely destructive - use with caution
- Requires exact confirmation text

**Cooldown:** 60 seconds

## 🛠️ Utility Commands

General utility and bot management commands.

### `/ping`

Test bot responsiveness and connection status.

**Usage:**

```
/ping
```

**Behavior:**

- Shows bot latency and API response times
- Confirms bot is online and responsive
- Useful for troubleshooting connection issues

**Cooldown:** 5 seconds

---

### `/question hint-add`

Add hints to existing quiz questions.

**Parameters:**

- `quiz-title` (required) - Quiz containing the question
- `question-number` (required) - Question number to add hint to
- `hint-title` (required) - Title/label for the hint button
- `hint-text` (required) - The hint content

**Usage:**

```
/question hint-add quiz-title:"Math Quiz" question-number:3 hint-title:"Formula" hint-text:"Use the Pythagorean theorem"
```

**Behavior:**

- Adds interactive hint buttons to quiz questions
- Hints appear as clickable buttons during quiz sessions
- Useful for educational quizzes and learning contexts

**Cooldown:** 15 seconds

## 👑 Bot Owner Commands

Special commands available only to the bot owner (person who hosts the bot).

::: danger Bot Owner Only
These commands can only be used by the person specified in the bot's configuration as the owner.
:::

### `/botowner status`

View comprehensive bot status and health information.

**Usage:**

```
/botowner status
```

**Behavior:**

- Shows system performance metrics
- Database connection status and statistics  
- Memory usage and uptime information
- Active quiz sessions across all servers

**Cooldown:** 10 seconds

---

### `/botowner dashboard`

Access advanced bot management features.

**Usage:**

```
/botowner dashboard
```

**Behavior:**

- Provides system-wide statistics
- Shows usage patterns across servers
- Allows monitoring bot performance and health

**Cooldown:** 30 seconds

---

### `/botowner db`

Manage database operations and maintenance.

**Usage:**

```
/botowner db
```

**Behavior:**

- Database health checks and statistics
- Maintenance operations and cleanup tools
- Performance monitoring and optimization insights

**Cooldown:** 60 seconds

## Command Behavior & Limitations

### Cooldowns

All commands have cooldowns to prevent spam and ensure bot stability:

- **Short (5s)**: Read-only commands like `/stats`, `/leaderboard`, `/ping`
- **Medium (10-30s)**: Interactive commands like `/quiz start`, `/admin` commands
- **Long (60s)**: Upload commands and destructive operations

### Permissions

Commands respect Discord's permission system:

- **Public**: Most quiz and stats commands available to all users
- **Admin**: Commands requiring "Manage Server" permissions
- **Owner**: Quiz/corpus creators can manage their own content
- **Bot Owner**: System-level commands for bot maintainers

### Auto-complete

Many commands provide auto-complete suggestions:

- Quiz titles and corpus names
- User mentions for stats commands
- Image IDs for quiz creation
- Administrative targets for management commands

### Error Handling

The bot provides helpful error messages for:

- Invalid parameters or file formats
- Permission or ownership issues
- Rate limiting and cooldown violations
- System errors and maintenance status

For additional help with commands, check our [FAQ](/faq) or visit the [GitHub Issues](https://github.com/anthonyronda/learn-polish-bot/issues) page.
