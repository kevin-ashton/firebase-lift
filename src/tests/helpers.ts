import { FirestoreLiftDocRoot, FirestoreLiftInitConfig } from '../models';
import { FirestoreLiftCollection } from '../FirestoreLiftCollection';
import * as firebase from 'firebase';
import { createFirestoreLift } from '../FirestoreLift';
import { clearFirestoreData } from '@firebase/testing';
import { TypedFirebaseObjectOrPrimativeRefGenerator, createRtdbLift } from '../RTDB';

/* *****************
  Demo Models
  *****************/

export interface Person extends FirestoreLiftDocRoot {
  name: string;
  age: number;
  weight: number;
  favFoods: {
    asian?: string;
    italian?: string;
    american?: string;
  };
}

export interface Book extends FirestoreLiftDocRoot {
  title: string;
  totalPages: number;
}

interface ExampleFirestore {
  Person: FirestoreLiftCollection<Person>;
  Book: FirestoreLiftCollection<Book>;
}

const testFirebaseConfig = { projectId: 'fir-lift', databaseURL: 'http://localhost:9000/?ns=fir-lift' };

export async function reset() {
  await clearFirestoreData(testFirebaseConfig);
}

let app: firebase.app.App;

export function init() {
  app = firebase.initializeApp(testFirebaseConfig);
  const db = app.firestore();
  db.settings({ host: 'localhost:8080', ssl: false });
}

export function getTestFirestoreLift() {
  const c: FirestoreLiftInitConfig = {
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
  };

  return createFirestoreLift<ExampleFirestore>(c);
}

export function getTestRtdbLift() {
  const nodes = {
    account: (null as unknown) as TypedFirebaseObjectOrPrimativeRefGenerator<Person>,
    book: (null as unknown) as TypedFirebaseObjectOrPrimativeRefGenerator<Book>
  };

  return createRtdbLift({ firebaseApp: app, nodes });
}
