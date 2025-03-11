# lunafications

A Bluesky bot that notifies you when you get blocked, added to lists, or when specific accounts make posts.

## Features

- **Block Notifications**: Get notified when someone blocks you
- **List Notifications**: Get notified when you're added to lists
- **Post Monitoring**: Get notified when specific accounts make posts
- **Easy to Use**: Users interact with the bot via DMs with simple commands

## Setup & Installation

### Prerequisites

- Node.js (v22+)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ImLunaHey/lunafications.git
   cd lunafications
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file with:
   ```
   BSKY_USERNAME=your_username.bsky.social
   BSKY_PASSWORD=your_password_or_app_password
   SQLITE_LOCATION=path/to/database.db  # Optional, defaults to in-memory
   ```
   
   > **Note**: For the password, you can use either your full account password or an app password with DM permissions.

4. Start the bot:
   ```bash
   npm start
   ```

### Deployment

For deployment on platforms like Railway, it's recommended to:

1. Set the environment variables in your deployment platform
2. Use a persistent storage path for your SQLite database, e.g., `/data/bsky.db`
3. Mount a volume to the `/data` directory to ensure database persistence across redeployments

## Usage

The bot provides instructions to end-users through its profile bio and responds to the following commands:

- `menu`: Display available commands
- `notify blocks`: Enable block notifications
- `notify lists`: Enable list notifications
- `notify all`: Enable all notifications
- `notify posts @username`: Get notified when a specific user makes a post
- `hide blocks`: Disable block notifications
- `hide lists`: Disable list notifications
- `hide posts @username`: Stop monitoring a specific user's posts
- `hide all`: Disable all notifications
- `settings`: View current notification settings

## Development

### Running tests

```bash
npm test
```

### Running tests with coverage

```bash
npm run coverage
```

### Testing in watch mode

```bash
npm run coverage:watch
```

## License

ISC

## Created by

[@imlunahey.com](https://bsky.app/profile/imlunahey.com)

Profile image and banner by [@ex.trathi.cc](https://bsky.app/profile/ex.trathi.cc)
