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

export type DomainNotifications = {
  /**
   * DID of the user
   */
  did: string;
  /**
   * Domain that the user wants to be notified about
   */
  domain: string;
};

export type DatabaseSchema = {
  settings: Settings;
  post_notifications: PostNotifications;
  domain_notifications: DomainNotifications;
};
