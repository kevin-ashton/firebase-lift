import * as firebase from 'firebase';

export type TypedFirebaseObjectOrPrimativeRefGenerator<T> = (path: string) => TypedFirebaseObjectOrPrimativeRef<T>;

export interface RootRtdbLift {
  _RawRtdb: firebase.database.Database;
}

interface RtdbConfig<T> {
  firebaseApp: firebase.app.App;
  nodes: T;
}

export function createRtdbLift<T>(config: RtdbConfig<T>): T & RootRtdbLift {
  const db = config.firebaseApp.database();

  const r: any = {
    _RawRtdb: db
  };

  Object.keys(config.nodes).forEach((key) => {
    r[key] = (path: string) => db.ref(`${key}/${path}`);
  });

  return r;
}

type TypedFirebaseObjectOrPrimativeRef<Obj extends {}> = Omit<
  firebase.database.Reference,
  'set' | 'update' | 'once' | 'on'
> & {
  set: (o: Obj) => ReturnType<firebase.database.Reference['set']>;
  update: (o: Partial<Obj>) => ReturnType<firebase.database.Reference['update']>;
  once: (type: 'value') => Promise<TypedSnapshot<Obj>>;
  on: (t: 'value', sub: (snap: TypedSnapshot<Obj>) => void) => ReturnType<firebase.database.Reference['on']>;
};

type TypedSnapshot<Obj extends {}> = Omit<firebase.database.DataSnapshot, 'val'> & {
  val: () => Obj | undefined;
};
