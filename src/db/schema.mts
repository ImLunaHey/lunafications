export type Settings = {
  /**
   * DID of the user
   */
  did: string;
  /**
   * Whether the user has block notifications enabled
   */
  blocks: 1 | 0;
  /**
   * Whether the user has list notifications enabled
   */
  lists: 1 | 0;
};

export type PostNotifications = {
  /**
   * DID of the user
   */
  did: string;
  /**
   * DID of the user that the user wants to be notified about
   */
  from: string;
};

export type NotificationOutbox = {
  key: string;
  recipient: string;
  payload: string;
  attempts: number;
  available_at: number;
  created_at: number;
};

export type AppState = {
  key: string;
  value: string;
};

export type DatabaseSchema = {
  settings: Settings;
  post_notifications: PostNotifications;
  notification_outbox: NotificationOutbox;
  app_state: AppState;
};
