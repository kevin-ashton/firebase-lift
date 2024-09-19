import { FirestoreLiftInitConfig } from '../models';
import { FirestoreLiftCollection } from '../FirestoreLiftCollection';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import 'firebase/compat/firestore';

import { createFirestoreLift } from '../FirestoreLift';
import { clearFirestoreData } from '@firebase/testing';
import { TypedFirebaseObjectOrPrimativeRefGenerator, createRtdbLift } from '../RTDB';

/* *****************
  Demo Models
  *****************/

export interface Person {
  id: string;
  createdAtMS: number;
  updatedAtMS: number;
  name: string;
  age: number;
  weight: number;
  favFoods: {
    asian?: string;
    italian?: string;
    american?: string;
  };
}

export interface Book {
  id: string;
  createdAtMS: number;
  updatedAtMS: number;
  title: string;
  nestedExample: {
    foo1: string;
    foo2: number;
    foo3?: string;
  };
  totalPages: number;
  derived?: {
    a: string;
    b: number;
  };
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
        collection: 'book',
        rootPropertiesToDisallowUpdatesOn: ['derived']
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
