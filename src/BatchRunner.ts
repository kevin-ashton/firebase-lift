import * as firebase from 'firebase';
import {
  BatchTask,
  BatchTaskEmpty,
  MagicDeleteString,
  MagicIncrementString,
  MagicServerTimestampString
} from './models';
import { generateFirestorePathFromObject, defaultEmptyTask } from './misc';

export class BatchRunner {
  public firestoreModule: typeof firebase.firestore;
  public app: firebase.app.App;

  constructor(config: { firestoreModule: typeof firebase.firestore; app: firebase.app.App }) {
    this.firestoreModule = config.firestoreModule;
    this.app = config.app;
  }

  // We use a magic string for deletes so we can pass around batches of change sets to be environment agnostic
  private scrubDataPreWrite(p: { obj: any; removeEmptyObjects: boolean }) {
    const { obj, removeEmptyObjects } = p;

    if (typeof obj === 'object') {
      let keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        let k = keys[i];
        if (obj[k] === MagicDeleteString) {
          obj[k] = this.firestoreModule.FieldValue.delete();
        } else if (obj[k] === MagicIncrementString) {
          obj[k] = this.firestoreModule.FieldValue.increment(1);
        } else if (obj[k] === undefined || obj[k] === null) {
          //Undefined values get coerced to null by the Firestore SDK, which makes no sense for a strongly typed library like this
          delete obj[k];
        } else if (typeof obj[k] === 'object') {
          if (removeEmptyObjects && Object.keys(obj[k]).length === 0) {
            delete obj[k];
          } else {
            obj[k] = this.scrubDataPreWrite({ obj: obj[k], removeEmptyObjects });
          }
        } else {
          obj[k] = obj[k];
        }
      }
    }
    if (typeof obj === 'string' && obj === MagicDeleteString) {
      return this.firestoreModule.FieldValue.delete();
    }
    return obj;
  }

  async executeBatch(b: BatchTask[], opts?: { transaction?: firebase.firestore.Transaction }) {
    const batch = (opts?.transaction ?? this.firestoreModule(this.app).batch()) as firebase.firestore.WriteBatch;

    try {
      for (let i = 0; i < b.length; i++) {
        let task = b[i];
        if (task.type === 'empty') {
          continue;
        }

        if (!task.id) {
          throw Error(`Unable to process item. Lacks an id. Collection: ${task.collection}. Task Type: ${task.type}`);
        }
        let ref = this.firestoreModule(this.app).collection(task.collection).doc(task.id);

        let newObj;
        switch (task.type) {
          case 'add':
            batch.set(ref, this.scrubDataPreWrite({ obj: task.doc, removeEmptyObjects: false }), { merge: true });
            break;
          case 'set':
            batch.set(ref, this.scrubDataPreWrite({ obj: task.doc, removeEmptyObjects: false }), { merge: false });
            break;
          case 'setPath':
            let p = generateFirestorePathFromObject(task.pathObj);
            let newPathVal = p.path.split('.').reduce((acc, val) => {
              if (acc[val] === undefined) {
                throw new Error('Missing value for setPath update');
              }
              return acc[val];
            }, task.value);
            newPathVal = this.scrubDataPreWrite({ obj: newPathVal, removeEmptyObjects: false });
            batch.update(ref, p.path, newPathVal);
            break;
          case 'update':
            //firestore set merge has the very dumb default behavior of making empty objects overwriting the object entirely
            newObj = this.scrubDataPreWrite({ obj: task.doc, removeEmptyObjects: true });
            batch.set(ref, newObj, { merge: true });
            break;
          case 'updateShallow':
            newObj = this.scrubDataPreWrite({ obj: task.doc, removeEmptyObjects: false });
            batch.update(ref, newObj);
            break;
          case 'delete':
            batch.delete(ref);
            break;
          default:
            // @ts-ignore
            throw new Error(`Unknown BatchTask type. Type: ${task.type}`);
        }
      }

      if (!opts?.transaction) {
        return batch.commit().then(() => defaultEmptyTask);
      } else {
        return defaultEmptyTask;
      }
      // Returning an empty task makes it easier for the helper functions (.add, .update) so they always return a batch type. Makes it so we don't have to check for undefined
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}
