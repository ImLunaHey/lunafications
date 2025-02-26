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

export type DatabaseSchema = {
  settings: Settings;
};
