import {
  FirestoreLiftRoot,
  FirestoreLiftInitConfig,
  MagicDeleteString,
  MagicIncrementString,
  MagicServerTimestampString,
  FirestoreLiftStats
} from './models';
import * as _ from 'lodash';
import { FirestoreLiftCollection } from './FirestoreLiftCollection';
import { BatchRunner } from './BatchRunner';

// Expects a generic of a very specific shape. See examples
export function createFirestoreLift<T>(config: FirestoreLiftInitConfig): T & FirestoreLiftRoot {
  const batchRunner = new BatchRunner({
    app: config.firebaseApp,
    firestoreModule: config.firestoreModule,
    onDocumentsWritten: config.onDocumentsWritten
  });

  const pendingFirestoreLift: any = {
    _GetStats: () => {
      let s: FirestoreLiftStats = {
        summary: {
          statsInitMS: Date.now(),
          totalActiveSubscriptions: 0,
          totalDocsFetched: 0,
          totalDocsWritten: 0,
          totalSubscriptionsOverTime: 0
        },
        byCollection: {}
      };
      Object.keys(config.collections).forEach((collectionName) => {
        let c = collectionName.charAt(0).toUpperCase() + collectionName.slice(1);
        let f: FirestoreLiftCollection<any> = pendingFirestoreLift[c];
        s.summary.totalDocsFetched += f._stats.docsFetched;
        s.summary.totalDocsWritten += f._stats.docsWritten;
        s.summary.totalActiveSubscriptions += Object.keys(f._stats.activeSubscriptions).length;
        s.summary.totalSubscriptionsOverTime += f._stats.totalSubscriptionsOverTime;
        s.byCollection[c] = f._stats;
      });

      return _.cloneDeep(s);
    },
    _setFirestoreLiftDisabledStatus: (isDisabled: boolean) => {
      Object.keys(config.collections).forEach((collectionName) => {
        let c = collectionName.charAt(0).toUpperCase() + collectionName.slice(1);
        pendingFirestoreLift[c].setFirestoreLiftDisabledStatus(isDisabled);
      });
    },
    _RawFirestore: config.firebaseApp.firestore(),
    _BatchRunner: batchRunner,
    _RawFirebaseApp: config.firebaseApp,
    _MagicDeleteValue: MagicDeleteString,
    _MagicIncrementValue: MagicIncrementString,
    _MagicServerTimestamp: MagicServerTimestampString
  };

  Object.keys(config.collections).forEach((key) => {
    const col = config.collections[key];
    pendingFirestoreLift[key] = new FirestoreLiftCollection({
      batchRunner,
      collection: col.collection,
      disableIdGeneration: !!col.disableIdGeneration,
      prefixIdWithCollection: col.prefixIdWithCollectionName === false ? false : true, // Want true by default
      rootPropertiesToDisallowUpdatesOn: col.rootPropertiesToDisallowUpdatesOn,
      enforceImmutability: config.enforceImmutability
    });
  });

  return pendingFirestoreLift;
}
