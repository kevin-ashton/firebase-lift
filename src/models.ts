import * as firebase from 'firebase';
import { BatchRunner } from './BatchRunner';

// Expected all docs extend this interface
export interface FirestoreLiftDocRoot {
  id: string;
  createdAtMS: number;
  updatedAtMS: number;
}

export interface FirestoreLiftRoot {
  _setFirestoreLiftDisabledStatus: (status: boolean) => void;
  _GetStats: () => FirestoreLiftStats;
  _RawFirestore: firebase.firestore.Firestore;
  _BatchRunner: BatchRunner;
  _MagicDeleteValue: any;
  _MagicIncrementValue: any;
}

export interface CollectionConfig {
  collection: string;
  prefixIdWithCollectionName?: boolean; // true (default)
  disableIdGeneration?: boolean; // false (default)
}

export interface FirestoreLiftInitConfig {
  collections: Record<string, CollectionConfig>;
  firebaseApp: firebase.app.App;
  firestoreModule: typeof firebase.firestore; // We need to import the actual module since we often use firebase-admin on the server and need to access certain fields for delete and other things
}

export interface FirestoreLiftStats {
  summary: {
    statsInitMS: number;
    totalDocsFetched: number;
    totalDocsWritten: number;
    totalSubscriptionsOverTime: number;
    totalActiveSubscriptions: number;
  };
  byCollection: { [key: string]: FirestoreLiftCollectionStats };
}

export type Change<T> = { doc: T; changeType: 'added' | 'modified' | 'removed' }[];

export type QueryResultSet<DocModel> = {
  docs: DocModel[];
  nextQuery?: SimpleQuery<DocModel>;
};

export type QuerySubscriptionResultSet<DocModel> = {
  docs: DocModel[];
  changes: Change<DocModel>[];
  metadata: firebase.firestore.SnapshotMetadata;
};

export type FirestoreLiftQuerySubscription<DocModel> = {
  subscribe: (
    fn: (p: QuerySubscriptionResultSet<DocModel>) => void,
    errorFn: (e: Error) => void
  ) => {
    unsubscribe: () => void;
  };
};

export type FirestoreLiftDocSubscription<DocModel> = {
  subscribe: (
    fn: (p: OrNull<DocModel>) => void,
    errorFn: (e: Error) => void
  ) => {
    unsubscribe: () => void;
  };
};

export type FirestoreLiftDocsSubscription<DocModel> = {
  subscribe: (
    fn: (p: Array<OrNull<DocModel>>) => void,
    errorFn: (e: Error) => void
  ) => {
    unsubscribe: () => void;
  };
};

/***********
  ORIGINAL
  ********** */

type WhereFilter<DocModel> = OptionalQuery<DocModel>;
type WhereFilterOp = '<' | '<=' | '==' | '>=' | '>' | 'in';
type OrderByDirection = 'desc' | 'asc';
export type startEndAtValueTypes = string | number;

export interface SimpleQuery<DocModel> {
  limit?: number;
  where?: WhereFilter<DocModel>[];
  orderBy?: { pathObj: OptionalFlex<DocModel>; dir?: OrderByDirection }[];
  startAtValue?: startEndAtValueTypes[];
  startAfterValue?: startEndAtValueTypes[];
  endAtValue?: startEndAtValueTypes[];
  endBeforeValue?: startEndAtValueTypes[];
  _internalStartAfterDocId?: any; // Used for pagination. If defined then we ignore startAt
}

export type OrNull<T> = T | null;

export type Optional<T> = { [P in keyof T]?: Optional2<T[P]> };
type Optional2<T> = { [P in keyof T]?: Optional3<T[P]> };
type Optional3<T> = { [P in keyof T]?: Optional4<T[P]> };
type Optional4<T> = { [P in keyof T]?: Optional5<T[P]> };
type Optional5<T> = { [P in keyof T]?: Optional6<T[P]> };
type Optional6<T> = { [P in keyof T]?: Optional7<T[P]> };
type Optional7<T> = { [P in keyof T]?: Optional8<T[P]> };
type Optional8<T> = { [P in keyof T]?: any };

export type OptionalQuery<T> = { [P in keyof T]?: [WhereFilterOp, T[P]] | ['in', T[P][]] | OptionalQuery2<T[P]> };
type OptionalQuery2<T> = { [P in keyof T]?: [WhereFilterOp, T[P]] | ['in', T[P][]] | OptionalQuery3<T[P]> };
type OptionalQuery3<T> = { [P in keyof T]?: [WhereFilterOp, T[P]] | ['in', T[P][]] | OptionalQuery4<T[P]> };
type OptionalQuery4<T> = { [P in keyof T]?: [WhereFilterOp, T[P]] | ['in', T[P][]] | OptionalQuery5<T[P]> };
type OptionalQuery5<T> = { [P in keyof T]?: [WhereFilterOp, T[P]] | ['in', T[P][]] | OptionalQuery6<T[P]> };
type OptionalQuery6<T> = { [P in keyof T]?: [WhereFilterOp, T[P]] | ['in', T[P][]] | OptionalQuery7<T[P]> };
type OptionalQuery7<T> = { [P in keyof T]?: [WhereFilterOp, T[P]] | ['in', T[P][]] | OptionalQuery8<T[P]> };
type OptionalQuery8<T> = { [P in keyof T]?: any };

// Allows you to create an object that mirrors the shape of a interface but you can put a boolean at any node.
// The object can then be used to extract the path
export type OptionalFlex<T> = { [P in keyof T]?: boolean | OptionalFlex2<T[P]> };
type OptionalFlex2<T> = { [P in keyof T]?: boolean | OptionalFlex3<T[P]> };
type OptionalFlex3<T> = { [P in keyof T]?: boolean | OptionalFlex4<T[P]> };
type OptionalFlex4<T> = { [P in keyof T]?: boolean | OptionalFlex5<T[P]> };
type OptionalFlex5<T> = { [P in keyof T]?: boolean | OptionalFlex6<T[P]> };
type OptionalFlex6<T> = { [P in keyof T]?: boolean | OptionalFlex7<T[P]> };
type OptionalFlex7<T> = { [P in keyof T]?: boolean | OptionalFlex8<T[P]> };
type OptionalFlex8<T> = { [P in keyof T]?: any };

interface BatchTaskRoot {
  collection: string;
  id: string;
}

export const MagicDeleteString = '____DELETE_DELETE_DELETE_DELETE____';
export const MagicIncrementString = '____INCREMENT_INCREMENT_INCREMENT____';
export const MagicServerTimestampString = '____SEVRVERTIMESTAMP_SEVRVERTIMESTAMP_SEVRVERTIMESTAMP____';

export interface BatchTaskAdd extends BatchTaskRoot {
  type: 'add';
  doc: any;
}

export interface BatchTaskEmpty extends BatchTaskRoot {
  type: 'empty';
}

export interface BatchTaskSet extends BatchTaskRoot {
  type: 'set';
  doc: any;
}

export interface BatchTaskSetPath extends BatchTaskRoot {
  type: 'setPath';
  pathObj: any;
  value: any;
}

export interface BatchTaskUpdate extends BatchTaskRoot {
  type: 'update';
  doc: any;
}

export interface BatchTaskDelete extends BatchTaskRoot {
  type: 'delete';
}

export type BatchTask =
  | BatchTaskAdd
  | BatchTaskSetPath
  | BatchTaskSet
  | BatchTaskUpdate
  | BatchTaskDelete
  | BatchTaskEmpty;

/***********
  LESS IMPORTANT ONES
  ********** */

export interface ActiveSubscriptions {
  [subscriptionId: string]: {
    subscriptionDetails: string;
    subscriberCount: number;
  };
}

export interface FirestoreLiftCollectionStats {
  statsInitMS: number;
  docsFetched: number;
  docsWritten: number; // Assumes the tasks were executed
  totalSubscriptionsOverTime: number;
  activeSubscriptions: ActiveSubscriptions;
}
