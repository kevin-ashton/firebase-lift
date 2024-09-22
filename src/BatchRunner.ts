import type firebase from 'firebase/compat/app';
import {
  BatchTask,
  BatchTaskEmpty,
  MagicDeleteString,
  MagicIncrementString,
  MagicServerTimestampString
} from './models';
import { generateFirestorePathFromObject, defaultEmptyTask } from './misc';
import { DocumentWriteChange } from './FirestoreLiftCollection';

export class BatchRunner {
  public firestoreModule: typeof firebase.firestore;
  public app: firebase.app.App;
  public onDocumentsWritten: (docData: DocumentWriteChange[]) => Promise<void>;

  constructor(config: {
    firestoreModule: typeof firebase.firestore;
    app: firebase.app.App;
    onDocumentsWritten: (docData: DocumentWriteChange[]) => Promise<void>;
  }) {
    this.firestoreModule = config.firestoreModule;
    this.app = config.app;
    this.onDocumentsWritten = config.onDocumentsWritten;
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
    b = b.filter((q) => q); //Filter out falsey

    const firestoreInstance = this.firestoreModule('isFakeFirestoreApp' in this.app ? undefined : this.app);

    const batch = (opts?.transaction ?? firestoreInstance.batch()) as firebase.firestore.WriteBatch;

    const __updatedAtMS = Date.now();

    try {
      const documentWriteChanges: DocumentWriteChange[] = [];
      for (let i = 0; i < b.length; i++) {
        let task = b[i];
        if (task.type === 'empty') {
          continue;
        }

        if (!task.id) {
          throw Error(`Unable to process item. Lacks an id. Collection: ${task.collection}. Task Type: ${task.type}`);
        }

        if (task.type === 'update' || task.type === 'updateShallow') {
          documentWriteChanges.push({
            collection: task.collection,
            docId: task.id,
            __updatedAtMS,
            type: 'update',
            docChanges: task.doc
          });
        } else if (task.type === 'delete') {
          documentWriteChanges.push({
            collection: task.collection,
            docId: task.id,
            __updatedAtMS,
            type: 'delete'
          });
        } else {
          documentWriteChanges.push({
            collection: task.collection,
            docId: task.id,
            __updatedAtMS,
            type: 'other'
          });
        }

        let ref = firestoreInstance.collection(task.collection).doc(task.id);

        let newObj;

        switch (task.type) {
          case 'add':
            batch.set(
              ref,
              this.scrubDataPreWrite({ obj: cloneDeep({ ...task.doc, __updatedAtMS }), removeEmptyObjects: false }),
              {
                merge: true
              }
            );
            break;
          case 'set':
            batch.set(
              ref,
              this.scrubDataPreWrite({ obj: cloneDeep({ ...task.doc, __updatedAtMS }), removeEmptyObjects: false }),
              {
                merge: false
              }
            );
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
            batch.update(ref, p.path, newPathVal, '__updatedAtMS', __updatedAtMS);
            break;
          case 'update':
            //firestore set merge has the very dumb default behavior of making empty objects overwriting the object entirely
            newObj = this.scrubDataPreWrite({ obj: cloneDeep(task.doc), removeEmptyObjects: true });
            batch.set(ref, { ...newObj, __updatedAtMS }, { merge: true });
            break;
          case 'updateShallow':
            newObj = this.scrubDataPreWrite({ obj: cloneDeep(task.doc), removeEmptyObjects: false });
            batch.update(ref, { ...newObj, __updatedAtMS });
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
        await batch.commit();
        try {
          await Promise.race([
            this.onDocumentsWritten(documentWriteChanges),
            new Promise((res) => {
              setTimeout(() => {
                res(null);
              }, 500);
            })
          ]);
        } catch (e) {
          console.error('error-on-documents-written');
          console.error(e);
        }
        return defaultEmptyTask;
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

function cloneDeep(obj: any) {
  if (obj === null) return null;
  let clone = Object.assign({}, obj);
  for (let i in clone) {
    if (clone[i] != null && typeof clone[i] == 'object') clone[i] = cloneDeep(clone[i]);
  }
  if (Array.isArray(obj)) {
    clone.length = obj.length;
    return Array.from(clone);
  }
  return clone;
}
