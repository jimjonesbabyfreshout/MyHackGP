import firebase from '@/utils/server/firebase-client-init';

export interface ApiKey {
  id: string;
  keyName: string;
  key: string;
  censoredKey: string;
  created: firebase.firestore.Timestamp | null;
  lastUsed: firebase.firestore.Timestamp | null;
}
