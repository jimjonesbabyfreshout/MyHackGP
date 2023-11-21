export interface ApiKey {
  id: string;
  keyName: string;
  key: string;
  censoredKey: string;
  created: string | null;
  lastUsed: string | null;
}
