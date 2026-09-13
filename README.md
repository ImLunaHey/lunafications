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
- pnpm 12

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ImLunaHey/lunafications.git
   cd lunafications
   ```

2. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
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
   pnpm start
   ```

### Deployment

For deployment on platforms like Railway, it's recommended to:

1. Set the environment variables in your deployment platform
2. Use a persistent storage path for your SQLite database, e.g., `/data/bsky.db`
3. Mount a volume to the `/data` directory to ensure database persistence across redeployments

### Private operations dashboard

The service also listens on `PORT` (Railway supplies this automatically, otherwise it defaults to `3000`). `/health` is always available. The dashboard remains disabled unless both of its secrets are configured.

Generate fresh secrets locally:

```bash
pnpm run dashboard:generate-secrets
```

Add both printed values to Railway as `DASHBOARD_SESSION_SECRET` and `DASHBOARD_OAUTH_PRIVATE_KEY`. Railway's `RAILWAY_PUBLIC_DOMAIN` is used automatically for OAuth. For another host, set `DASHBOARD_PUBLIC_URL` to its public HTTPS origin, without a path.

The dashboard uses Bluesky OAuth and only accepts the immutable DID belonging to `@imlunahey.com`. Other accounts are rejected even if the handle changes or is impersonated. Sessions last 12 hours, are stored as keyed hashes, and the dashboard is read-only.

### Rust shadow worker

The repository includes a read-only Rust worker that independently consumes the same Jetstream collections and logs every notification it believes the production service would enqueue. It cannot send messages and does not accept Bluesky credentials.

Deploy it as a second Railway service from this repository with:

```text
RAILWAY_DOCKERFILE_PATH=Dockerfile.shadow
SHADOW_API_URL=http://<production-service>.railway.internal:<production-port>
SHADOW_API_TOKEN=<shared random token>
RUST_LOG=info
```

Set the same `SHADOW_API_TOKEN` on the production TypeScript service. `pnpm run dashboard:generate-secrets` generates a suitable value. The production service exposes only a snapshot of notification preferences and post subscriber DIDs through this token-authenticated interface; missing or weak tokens fail closed. Rust refreshes that snapshot every 30 seconds and processes Jetstream events locally, avoiding per-event requests or extra SQLite load. Do not give the shadow service `BSKY_USERNAME`, `BSKY_PASSWORD`, `SQLITE_LOCATION`, or a volume.

The shadow service exposes `/health` on Railway's `PORT`, including its Jetstream connection status and event, decision, and error counters. Compare `shadow notification decision` entries with production `Notification queued` and `Duplicate notification ignored` entries using their identical `key` fields.

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
pnpm test
```

### Running tests with coverage

```bash
pnpm run coverage
```

### Testing in watch mode

```bash
pnpm run coverage:watch
```

## License

ISC

## Created by

[@imlunahey.com](https://bsky.app/profile/imlunahey.com)

Profile image and banner by [@ex.trathi.cc](https://bsky.app/profile/ex.trathi.cc)
