# Firebase Lift

Firebase provides a variety of tools that are amazing. This wraps various aspects of the api.

## Firestore

### Features
* Types on returned documents
* Types on various CRUD functions
* Types for query construction
* Ability group queries/doc fetches
* Metrics that track doc read/writes for various collections

## Limitations
* Firestore caching is always disabled
* Sub collections are not supported
* Server timestamps are not supported
* Array filters are currently not supported
* Only supports basic types string, number, array, maps. No support for geo data, timestamps, etc.
* Increment is limited to a single number increment (no jumping by multiple numbers, or decrementing)
* startAt, startAfter, endAt, endBefore are supported for values but not for firestore docs or query docs. In other words you must use a value and not a firestore document when using those filters.

## Realtime Database

### Features
* Add some types for objects/primatives

### Limitations
* Only covers part of the API. You can access the raw refs to do everything normally without types.

## Usage

```ts
import {
  createRtdbLift,
  createFirestoreLift,
  FirestoreLiftCollection,
  TypedFirebaseObjectOrPrimativeRefGenerator,
} from 'firebase-lift';
import * as firebase from 'firebase';

interface Person {
  id: string;
  createdAtMS: number;
  updatedAtMS: number;
  name: string;
  age: number;
}

interface Book {
  id: string;
  createdAtMS: number;
  updatedAtMS: number;
  title: string;
  year: number;
}

interface Heartbeat {
  dateMs: number;
  msg: string;
}

interface DeviceInfo {
  dateMs: number;
  dId: string;
}

const app = firebase.initializeApp({} as any);

const firestoreLiftExample = createFirestoreLift<{
  Person: FirestoreLiftCollection<Person>;
  Book: FirestoreLiftCollection<Book>;
}>({
  collections: {
    Person: {
      collection: 'person'
    },
    Book: {
      collection: 'book'
    }
  },
  firebaseApp: app,
  firestoreModule: firebase.firestore
});

const rtdbLiftExample = createRtdbLift({
  firebaseApp: app,
  nodes: {
    Heartbeat: (null as unknown) as TypedFirebaseObjectOrPrimativeRefGenerator<Heartbeat>,
    DeviceInfo: (null as unknown) as TypedFirebaseObjectOrPrimativeRefGenerator<DeviceInfo>
  }
});

```
