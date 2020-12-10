import * as firebase from 'firebase';
import {
  BatchTaskAdd,
  BatchTaskDelete,
  BatchTaskEmpty,
  BatchTaskUpdate,
  BatchTaskSetPath,
  BatchTaskSet,
  Optional,
  OptionalFlex,
  SimpleQuery,
  FirestoreLiftCollectionStats,
  ActiveSubscriptions,
  QueryResultSet,
  FirestoreLiftQuerySubscription,
  QuerySubscriptionResultSet,
  Change,
  FirestoreLiftDocSubscription,
  FirestoreLiftDocsSubscription,
  BatchTaskUpdateShallow
} from './models';
import { generatePushID, generateQueryRef, defaultEmptyTask, generateFirestorePathFromObject } from './misc';
import { BatchRunner } from './BatchRunner';
import * as _ from 'lodash';
import * as md5 from 'md5';
import * as jsonStable from 'json-stable-stringify';

export class FirestoreLiftCollection<DocModel extends { id: string }> {
  private readonly collection: string;
  private readonly batchRunner: BatchRunner;
  private readonly enforceImmutability: boolean;
  public _stats: FirestoreLiftCollectionStats = {
    statsInitMS: Date.now(),
    docsFetched: 0,
    docsWritten: 0,
    activeSubscriptions: {},
    totalSubscriptionsOverTime: 0
  };
  private firestoreSubscriptionIdCounter: number = 1;
  private firestoreSubscriptions: {
    [subscriptionId: string]: {
      subscriptionDetails: any;
      fns: { [subId: string]: any };
      errorFns: { [subId: string]: any };
      firestoreUnsubscribeFn: any;
      currentValue?: any;
    };
  } = {};
  private readonly prefixIdWithCollection: boolean;
  private readonly disableIdGeneration: boolean;
  private firestore: firebase.firestore.Firestore;
  private isDisabled: boolean = false;
  private rootPropertiesToDisallowUpdatesOn: string[];

  constructor(config: {
    collection: string;
    batchRunner: BatchRunner;
    prefixIdWithCollection: boolean;
    disableIdGeneration: boolean;
    rootPropertiesToDisallowUpdatesOn?: string[];
    enforceImmutability?: boolean;
  }) {
    this.collection = config.collection;
    this.batchRunner = config.batchRunner;
    this.enforceImmutability = config.enforceImmutability === true;
    this.firestore = this.batchRunner.firestoreModule(this.batchRunner.app);
    this.prefixIdWithCollection = config.prefixIdWithCollection; // Add the collection name as a prefix to an id. Makes them easier to read
    this.disableIdGeneration = config.disableIdGeneration; // Some id's (such as account ids) you may not want firestore lift to ever generate an id because you want to force it to be assigned manually
    this.rootPropertiesToDisallowUpdatesOn = config.rootPropertiesToDisallowUpdatesOn || [];
  }

  public generateId() {
    if (this.disableIdGeneration) {
      throw new Error(
        `Unable to generate id for collection. It has been disabled by init config. Collection: ${this.collection}`
      );
    }
    return this.prefixIdWithCollection ? `${this.collection}-${generatePushID()}` : generatePushID();
  }

  private registerSubscription(p: { uniqueSubscriptionId: number; subscriptionId: string; fn: any; errorFn?: any }) {
    if (!this.firestoreSubscriptions[p.subscriptionId]) {
      throw Error('Cannot register a subscription until it has been setup');
    }

    this.firestoreSubscriptions[p.subscriptionId].fns[p.uniqueSubscriptionId] = p.fn;
    if (p.errorFn) {
      this.firestoreSubscriptions[p.subscriptionId].errorFns[p.uniqueSubscriptionId] = p.errorFn;
    }
  }
  private unregisterSubscription(p: { uniqueSubscriptionId: number; subscriptionId: string }) {
    if (!this.firestoreSubscriptions[p.subscriptionId]) {
      console.warn('Unable to unregister a subscription if it does not exist');
      return;
    }

    delete this.firestoreSubscriptions[p.subscriptionId].fns[p.uniqueSubscriptionId];
    delete this.firestoreSubscriptions[p.subscriptionId].errorFns[p.uniqueSubscriptionId];

    if (Object.keys(this.firestoreSubscriptions[p.subscriptionId].fns).length <= 0) {
      this.firestoreSubscriptions[p.subscriptionId].firestoreUnsubscribeFn();
      delete this.firestoreSubscriptions[p.subscriptionId];
    }
  }

  private updateSubscriptionStats() {
    let activeSubscriptions: ActiveSubscriptions = {};

    for (let subscriptionId in this.firestoreSubscriptions) {
      activeSubscriptions[subscriptionId] = {
        subscriptionDetails: this.firestoreSubscriptions[subscriptionId].subscriptionDetails,
        subscriberCount: Object.keys(this.firestoreSubscriptions[subscriptionId].fns).length
      };
    }

    this._stats.activeSubscriptions = activeSubscriptions;
  }

  public docSubscription(docId: string): FirestoreLiftDocSubscription<DocModel> {
    let subscriptionId = md5(docId);
    let docRef = this.firestore.collection(this.collection).doc(docId);

    const subscriptionStackTrace = new Error().stack;

    return {
      subscribe: (fn, errorFn?: (e: Error) => void) => {
        let uniqueSubscriptionId = this.firestoreSubscriptionIdCounter;
        this.firestoreSubscriptionIdCounter += 1;
        if (!this.firestoreSubscriptions[subscriptionId]) {
          let unsubFirestore = docRef.onSnapshot(
            // Disable the cache. Can cause strange behavior
            { includeMetadataChanges: true },
            (snapshot) => {
              if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
                return;
              }
              this._stats.docsFetched += 1;
              let value: DocModel | null = snapshot.exists ? (snapshot.data() as any) : null;

              if (this.isDisabled) {
                console.warn('Cannot docSubscription while firestoreLift disabled');
                value = this.firestoreSubscriptions[subscriptionId].currentValue || null;
              }

              if (this.enforceImmutability) {
                if (typeof Proxy !== 'undefined') {
                  value = new Proxy(value, proxyPreventMutations);
                } else {
                  console.warn('Cannot enforce immutability since environment does not support Proxies');
                }
              }

              this.firestoreSubscriptions[subscriptionId].currentValue = value;
              for (let i in this.firestoreSubscriptions[subscriptionId].fns) {
                this.firestoreSubscriptions[subscriptionId].fns[i](value);
              }
            },
            (err) => {
              let msg = `${err.message} in firestore-lift subscription on collection ${this.collection} with docId:${docId}`;
              // Do NOT delete the console.error. Propagation beyond this point is too inconsistent. This would have saved many hours of dev work with swallowed errors
              console.error(msg);
              let detailedError = new Error(msg);
              detailedError.stack = subscriptionStackTrace;
              if (Object.keys(this.firestoreSubscriptions[subscriptionId].errorFns).length > 0) {
                for (let i in this.firestoreSubscriptions[subscriptionId].errorFns) {
                  this.firestoreSubscriptions[subscriptionId].errorFns[i](detailedError);
                }
              } else {
                console.error(detailedError);
              }
            }
          );

          this.firestoreSubscriptions[subscriptionId] = {
            fns: {},
            errorFns: {},
            firestoreUnsubscribeFn: unsubFirestore,
            subscriptionDetails: docId
          };
          this.registerSubscription({ fn, errorFn, subscriptionId: subscriptionId, uniqueSubscriptionId });
          this._stats.totalSubscriptionsOverTime += 1;
        } else {
          if (this.firestoreSubscriptions[subscriptionId].currentValue) {
            // First time function gets a copy of the current value
            fn(this.firestoreSubscriptions[subscriptionId].currentValue);
          }
          this.registerSubscription({ fn, errorFn, subscriptionId: subscriptionId, uniqueSubscriptionId });
        }
        this.updateSubscriptionStats();

        return {
          unsubscribe: () => {
            this.unregisterSubscription({ subscriptionId: subscriptionId, uniqueSubscriptionId });
            this.updateSubscriptionStats();
          }
        };
      }
    };
  }

  public docsSubscription(docIds: string[]): FirestoreLiftDocsSubscription<DocModel> {
    return {
      subscribe: (fn, errorFn) => {
        const unsubscribeFns: any[] = [];
        if (docIds.length === 0) {
          // No docs to subscribe to so just return an empty array
          fn([]);
        } else {
          const currentValue: Array<DocModel | null> = docIds.map(() => null);
          const hasFiredOnceTracker: Record<string, true> = {};
          docIds.forEach((id, index) => {
            const subRef = this.docSubscription(id);
            const sub = subRef.subscribe(
              (doc) => {
                if (!hasFiredOnceTracker[index]) {
                  hasFiredOnceTracker[index] = true;
                }
                currentValue[index] = doc;
                if (Object.keys(hasFiredOnceTracker).length === docIds.length) {
                  fn(currentValue);
                }
                unsubscribeFns.push(sub);
              },
              (e) => {
                errorFn(e);
              }
            );
          });
        }

        return {
          unsubscribe: () => {
            unsubscribeFns.forEach((thisFn) => thisFn());
          }
        };
      }
    };
  }

  public querySubscription(query: SimpleQuery<DocModel>): FirestoreLiftQuerySubscription<DocModel> {
    let subscriptionId = md5(jsonStable(query));
    let queryRef = generateQueryRef(query, this.collection, this.firestore as any);

    const subscriptionStackTrace = new Error().stack;

    return {
      subscribe: (fn, errorFn: (e: Error) => void) => {
        let uniqueSubscriptionId = this.firestoreSubscriptionIdCounter;
        this.firestoreSubscriptionIdCounter += 1;
        if (!this.firestoreSubscriptions[subscriptionId]) {
          let hasFiredAtLeastOnce = false;
          let unsubFirestore = queryRef.onSnapshot(
            // Disable the cache. Can cause strange behavior
            { includeMetadataChanges: true },
            (snapshot) => {
              if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
                return;
              }

              let docs: any = snapshot.docs.map((d) => d.data());
              let changes: Change<DocModel> = [];

              this._stats.docsFetched += snapshot.docChanges().length;
              snapshot.docChanges().forEach((change) => {
                changes.push({ doc: change.doc.data() as any, changeType: change.type });
              });

              let value: QuerySubscriptionResultSet<DocModel> = {
                docs: docs,
                rawDocs: snapshot.docs,
                changes: changes as any,
                metadata: snapshot.metadata
              };

              if (this.isDisabled) {
                console.warn('Cannot querySubscription while firestoreLift disabled');
                value = this.firestoreSubscriptions[subscriptionId].currentValue || {
                  changes: [],
                  docs: [],
                  metadata: snapshot.metadata
                };
              }

              this.firestoreSubscriptions[subscriptionId].currentValue = value;

              //Firestore randomly fires some subscriptions about every 25 seconds with an empty array of docChanges. It's quite baffling.
              //But it provides no useful data and triggers a cascade of data fetching which we want to prevent.
              if (hasFiredAtLeastOnce && !snapshot.docChanges().length) {
                return;
              }

              hasFiredAtLeastOnce = true;

              for (let i in this.firestoreSubscriptions[subscriptionId].fns) {
                this.firestoreSubscriptions[subscriptionId].fns[i](value);
              }
            },
            (err) => {
              let msg = `${err.message} in firestore-lift subscription on collection ${
                this.collection
              } with query:${JSON.stringify(query)}`;
              // Do NOT delete the console.error. Propagation beyond this point is too inconsistent. This would have saved many hours of dev work with swallowed errors
              console.error(msg);
              let detailedError = new Error(msg);
              detailedError.stack = subscriptionStackTrace;
              if (Object.keys(this.firestoreSubscriptions[subscriptionId].errorFns).length > 0) {
                for (let i in this.firestoreSubscriptions[subscriptionId].errorFns) {
                  this.firestoreSubscriptions[subscriptionId].errorFns[i](detailedError);
                }
              } else {
                console.error(detailedError);
              }
            }
          );
          this.firestoreSubscriptions[subscriptionId] = {
            fns: {},
            errorFns: {},
            firestoreUnsubscribeFn: unsubFirestore,
            subscriptionDetails: query
          };
          this.registerSubscription({ fn, errorFn, subscriptionId, uniqueSubscriptionId });
          this._stats.totalSubscriptionsOverTime += 1;
        } else {
          if (this.firestoreSubscriptions[subscriptionId].currentValue) {
            // First time function gets a copy of the current value
            fn(this.firestoreSubscriptions[subscriptionId].currentValue);
          }
          this.registerSubscription({ fn, errorFn, subscriptionId, uniqueSubscriptionId });
        }
        this.updateSubscriptionStats();

        return {
          unsubscribe: () => {
            this.unregisterSubscription({ subscriptionId, uniqueSubscriptionId });
            this.updateSubscriptionStats();
          }
        };
      }
    };
  }

  async multiQuery(p: {
    queries: SimpleQuery<DocModel>[];
    mergeProcess?: { orderBy?: { sortKey: keyof DocModel; dir: 'asc' | 'desc' }; runDedupe?: boolean };
  }): Promise<QueryResultSet<DocModel>> {
    const results = await Promise.all(p.queries.map((q) => this.query(q)));
    let docs: DocModel[] = [];
    let rawDocs: Array<firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>> = [];
    results.forEach((res) => {
      docs.push(...res.docs);
      rawDocs.push(...res.rawDocs);
    });

    if (p.mergeProcess?.runDedupe) {
      docs = _.uniqBy(docs, 'id');
    }

    if (p.mergeProcess?.orderBy) {
      docs = _.sortBy(docs, p.mergeProcess.orderBy.sortKey);

      if (p.mergeProcess.orderBy.dir === 'desc') {
        docs.reverse();
      }
    }

    return {
      docs,
      rawDocs
    };
  }

  multiQuerySubscription(p: {
    queries: SimpleQuery<DocModel>[];
    mergeProcess?: { orderBy?: { sortKey: keyof DocModel; dir: 'asc' | 'desc' }; runDedupe?: boolean };
  }): FirestoreLiftQuerySubscription<DocModel> {
    return {
      subscribe: (fn, errorFn) => {
        const unsubscribeFns: any[] = [];
        if (p.queries.length === 0) {
          // Since no queries we just return an empty array
          fn({
            changes: [],
            docs: [],
            metadata: { fromCache: false, hasPendingWrites: false, isEqual: false as any },
            rawDocs: []
          });
        } else {
          const currentValues: DocModel[][] = p.queries.map(() => []);
          const currentRawDocs: Array<Array<
            firebase.firestore.QueryDocumentSnapshot<firebase.firestore.DocumentData>
          >> = p.queries.map(() => []);
          const hasFiredOnceTracker: Record<string, true> = {};
          let hasFiredOnce = false;
          p.queries.forEach((q, index) => {
            const subRef = this.querySubscription(q);
            const sub = subRef.subscribe(
              (result) => {
                if (!hasFiredOnceTracker[index]) {
                  hasFiredOnceTracker[index] = true;
                }
                currentValues[index] = result.docs;
                currentRawDocs[index] = result.rawDocs;
                if (Object.keys(hasFiredOnceTracker).length === p.queries.length) {
                  let docs = _.flatten(currentValues);
                  let rawDocs = _.flatten(currentRawDocs);

                  if (p.mergeProcess?.runDedupe) {
                    docs = _.uniqBy(docs, 'id');
                  }

                  if (p.mergeProcess?.orderBy) {
                    docs = _.sortBy(docs, p.mergeProcess.orderBy.sortKey);

                    if (p.mergeProcess.orderBy.dir === 'desc') {
                      docs.reverse();
                    }
                  }
                  fn({
                    docs,
                    changes: hasFiredOnce ? result.changes : [],
                    metadata: result.metadata,
                    rawDocs: rawDocs
                  });
                  hasFiredOnce = true;
                }
              },
              (e) => {
                errorFn(e);
              }
            );
            unsubscribeFns.push(sub.unsubscribe);
          });
        }

        return {
          unsubscribe: () => {
            unsubscribeFns.forEach((f) => f());
          }
        };
      }
    };
  }

  async query(query: SimpleQuery<DocModel>): Promise<QueryResultSet<DocModel>> {
    if (this.isDisabled) {
      console.warn('Cannot query while firestoreLift disabled');
      return { docs: [], rawDocs: [] };
    }

    try {
      let queryRef = generateQueryRef(query, this.collection, this.firestore as any);
      if (query._internalStartAfterDocId) {
        // Find start doc. This is used for pagination
        let startAfterDoc = await this.firestore.collection(this.collection).doc(query._internalStartAfterDocId).get();
        queryRef = queryRef.startAfter(startAfterDoc) as any;
      }
      let results: DocModel[] = [];
      let res = await queryRef.get();
      for (let i = 0; i < res.docs.length; i++) {
        let doc: any = res.docs[i].data();
        results.push(doc);
      }

      let result: QueryResultSet<DocModel> = { docs: results, rawDocs: res.docs };

      if (res.size === query.limit) {
        let paginationQuery = { ...query };
        let lastDoc = res.docs[res.docs.length - 1];
        paginationQuery._internalStartAfterDocId = lastDoc.id;
        result.nextQuery = paginationQuery;
      }

      this._stats.docsFetched += result.docs.length;
      return result;
    } catch (err) {
      let msg = `${err.message} in firestore-lift subscription on collection ${
        this.collection
      } with query:${JSON.stringify(query)}`;
      // Do NOT delete the console.error. Propagation beyond this point is too inconsistent. This would have saved many hours of dev work with swallowed errors
      console.error(msg);
      throw err;
    }
  }

  // Fetches a batch of documents based on ids
  async getDocs(ids: string[]): Promise<Array<DocModel | null>> {
    if (this.isDisabled) {
      console.warn('Cannot get while firestoreLift disabled');
      return [];
    }
    let p = [];
    for (let i = 0; i < ids.length; i++) {
      p.push(
        (async () => {
          try {
            let res = await this.firestore.collection(this.collection).doc(ids[i]).get();
            let doc = res.data();
            if (doc) {
              return doc as any;
            } else {
              return null;
            }
          } catch (err) {
            let msg = `${err.message} in firestore-lift get action ${this.collection} with id:${ids[i]}`;
            // Do NOT delete the console.error. Propagation beyond this point is too inconsistent. This would have saved many hours of dev work with swallowed errors
            console.error(msg);
            throw err;
          }
        })()
      );
    }

    this._stats.docsFetched += p.length;
    return await Promise.all(p);
  }

  async getDoc(id: string): Promise<DocModel | null> {
    if (this.isDisabled) {
      console.warn('Cannot add while firestoreLift disabled');
      null;
    }
    const val = await this.getDocs([id]);

    if (val[0]) {
      return val[0];
    }

    return null;
  }

  // Adds a document
  async add(request: { doc: DocModel }, config?: { returnBatchTask: boolean }): Promise<BatchTaskAdd | BatchTaskEmpty> {
    if (this.isDisabled) {
      console.warn('Cannot add while firestoreLift disabled');
      return defaultEmptyTask;
    }
    if (!request.doc['id']) {
      request.doc['id'] = this.generateId();
    }

    let task: BatchTaskAdd = {
      id: request.doc['id'],
      type: 'add',
      collection: this.collection,
      doc: request.doc
    };

    this._stats.docsWritten += 1;
    if (config && config.returnBatchTask) {
      return task;
    } else {
      return await this.batchRunner.executeBatch([task]);
    }
  }

  // Overwrites a doc
  async set(
    request: { id: string; doc: DocModel },
    config?: { returnBatchTask: boolean }
  ): Promise<BatchTaskSet | BatchTaskEmpty> {
    if (this.isDisabled) {
      console.warn('Cannot setDoc while firestoreLift disabled');
      return defaultEmptyTask;
    }

    if (!request.doc['id']) {
      request.doc['id'] = request.id;
    }

    let task: BatchTaskSet = {
      type: 'set',
      id: request.doc['id'],
      collection: this.collection,
      doc: request.doc
    };

    this._stats.docsWritten += 1;
    if (config && config.returnBatchTask) {
      return task;
    } else {
      return await this.batchRunner.executeBatch([task]);
    }
  }

  // Destructive update/delete for document path. Does not merge with existing data.
  async setPath(
    request: { id: string; pathObj: OptionalFlex<DocModel>; value: Optional<DocModel> },
    config?: { returnBatchTask: boolean; allowWritesToAllPaths?: boolean }
  ): Promise<BatchTaskSetPath | BatchTaskEmpty> {
    if (this.isDisabled) {
      console.warn('Cannot setPath while firestoreLift disabled');
      return defaultEmptyTask;
    }

    if (!config?.allowWritesToAllPaths) {
      for (let i = 0; i < this.rootPropertiesToDisallowUpdatesOn.length; i++) {
        if ((request.pathObj as any)[this.rootPropertiesToDisallowUpdatesOn[i]] !== undefined) {
          throw new Error(
            `You cannot run setPath because "${this.rootPropertiesToDisallowUpdatesOn[i]}" has been disabled as path you can write to. To override this set the "allowWritesToAllPaths" config option.`
          );
        }
      }
    }

    let task: BatchTaskSetPath = {
      type: 'setPath',
      id: request.id,
      pathObj: request.pathObj,
      value: request.value,
      collection: this.collection
    };
    this._stats.docsWritten += 1;
    if (config && config.returnBatchTask) {
      return task;
    } else {
      return await this.batchRunner.executeBatch([task]);
    }
  }

  // Updates/deletes parts of a document. Will deep merge with existing data. Equivalent to _.deepMerge(doc, docUpdate)
  async update(
    request: { id: string; doc: Optional<DocModel> },
    config?: { returnBatchTask?: boolean; allowWritesToAllPaths?: boolean }
  ): Promise<BatchTaskUpdate | BatchTaskEmpty> {
    if (this.isDisabled) {
      console.warn('Cannot update while firestoreLift disabled');
      return defaultEmptyTask;
    }

    if (!config?.allowWritesToAllPaths) {
      for (let i = 0; i < this.rootPropertiesToDisallowUpdatesOn.length; i++) {
        if ((request.doc as any)[this.rootPropertiesToDisallowUpdatesOn[i]] !== undefined) {
          throw new Error(
            `You cannot run setPath because "${this.rootPropertiesToDisallowUpdatesOn[i]}" has been disabled as path you can write to. To override this set the "allowWritesToAllPaths" config option.`
          );
        }
      }
    }

    let task: BatchTaskUpdate = {
      type: 'update',
      id: request.id,
      doc: request.doc,
      collection: this.collection
    };
    this._stats.docsWritten += 1;
    if (config && config.returnBatchTask) {
      return task;
    } else {
      return await this.batchRunner.executeBatch([task]);
    }
  }

  //Updates the document shallowly. Equivalent to Object.assign(doc, docUpdate)
  async updateShallow(
    request: { id: string; doc: Partial<DocModel> },
    config?: { returnBatchTask?: boolean; allowWritesToAllPaths?: boolean }
  ): Promise<BatchTaskUpdateShallow | BatchTaskEmpty> {
    if (this.isDisabled) {
      console.warn('Cannot update while firestoreLift disabled');
      return defaultEmptyTask;
    }

    if (!config?.allowWritesToAllPaths) {
      for (let i = 0; i < this.rootPropertiesToDisallowUpdatesOn.length; i++) {
        if ((request.doc as any)[this.rootPropertiesToDisallowUpdatesOn[i]] !== undefined) {
          throw new Error(
            `You cannot run setPath because "${this.rootPropertiesToDisallowUpdatesOn[i]}" has been disabled as path you can write to. To override this set the "allowWritesToAllPaths" config option.`
          );
        }
      }
    }

    const task: BatchTaskUpdateShallow = {
      type: 'updateShallow',
      id: request.id,
      doc: request.doc,
      collection: this.collection
    };
    this._stats.docsWritten += 1;
    if (config && config.returnBatchTask) {
      return task;
    } else {
      return await this.batchRunner.executeBatch([task]);
    }
  }

  // Deletes a document
  async delete(r: { id: string }, config?: { returnBatchTask: boolean }): Promise<BatchTaskDelete | BatchTaskEmpty> {
    if (this.isDisabled) {
      console.warn('Cannot delete while firestoreLift disabled');
      return defaultEmptyTask;
    }
    let task: BatchTaskDelete = {
      type: 'delete',
      collection: this.collection,
      id: r.id
    };
    this._stats.docsWritten += 1;
    if (config && config.returnBatchTask) {
      return task;
    } else {
      return await this.batchRunner.executeBatch([task]);
    }
  }

  setFirestoreLiftDisabledStatus(status: boolean) {
    this.isDisabled = status;
  }
}
if (typeof Proxy !== 'undefined') {
  var proxyPreventMutations = {
    get(target: any, key: string): any {
      if (typeof target[key] === 'object' && target[key] !== null) {
        return new Proxy(target[key], proxyPreventMutations);
      } else {
        return target[key];
      }
    },
    set() {
      console.info('Trying to mutate firestore lift data!!!! Download dev bundle');
      console.error(new Error().stack);
      throw new Error('Cannot mutate objects returned from Firestore Lift');
    }
  };
}
