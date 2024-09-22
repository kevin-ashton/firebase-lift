import { describe, test, setOptions, otest, xtest, run } from 'nano-test-runner';
import { getTestFirestoreLift, reset, Person, Book } from './helpers';
import * as stable from 'json-stable-stringify';
import * as _ from 'lodash';
import * as assert from 'assert';
import * as jsonStable from 'json-stable-stringify';
import { SimpleQuery } from '../models';

setOptions({ runPattern: 'serial', suppressConsole: false });

const t = getTestFirestoreLift();

describe('Basic CRUD', () => {
  const bookId = t.Book.generateId();

  const initialBook: Book = {
    id: bookId,
    createdAtMS: Date.now(),
    updatedAtMS: Date.now(),
    nestedExample: {
      foo1: 'foo1',
      foo2: 20,
      foo3: 'foo3'
    },
    title: 'The Cat and the Hat',
    totalPages: 34
  };

  run(async () => await reset());
  test('create doc', async () => {
    await reset();
    await t.Book.add({
      doc: initialBook
    });
  });

  test('fetch by id', async () => {
    let book = await t.Book.getDoc(bookId);
    if (!book) {
      throw 'No book found';
    }
  });

  test('update object', async () => {
    const newTitle = 'Harry Potter';
    const newFoo1 = 'Updated foo1';

    let expectedUpdated: Book = JSON.parse(JSON.stringify(initialBook));
    expectedUpdated.title = newTitle;
    expectedUpdated.nestedExample.foo1 = newFoo1;

    await t.Book.update({ id: bookId, doc: { title: newTitle, nestedExample: { foo1: newFoo1 } } });
    let b1 = await t.Book.getDoc(bookId);
    if (!b1) {
      throw 'No object found';
    }
    // @ts-ignore
    delete b1['__updatedAtMS'];
    assert.deepStrictEqual(stable(b1), stable(expectedUpdated));
  });

  test('update object (disabled field)', async () => {
    assert.rejects(async () => {
      await t.Book.update({ id: bookId, doc: { derived: { a: 'a', b: 1 } } });
    });
  });

  test('update object (disabled field) with override', async () => {
    const d = { a: 'a', b: Math.random() };
    await t.Book.update({ id: bookId, doc: { derived: d } }, { allowWritesToAllPaths: true });
    let b1 = await t.Book.getDoc(bookId);
    if (!b1) {
      throw 'No object found';
    }
    assert.deepStrictEqual(stable(b1.derived), stable(d));
  });

  test('update shallow object', async () => {
    await reset();
    await t.Book.add({
      doc: initialBook
    });

    const newTitle = 'Harry Potter';
    const newFoo1 = 'Updated foo1';
    const newFoo2 = Math.random();

    let expectedUpdated: Book = JSON.parse(JSON.stringify(initialBook));
    expectedUpdated.title = newTitle;
    expectedUpdated.nestedExample.foo1 = newFoo1;
    expectedUpdated.nestedExample.foo2 = newFoo2;
    delete expectedUpdated.nestedExample.foo3;

    await t.Book.updateShallow({
      id: bookId,
      doc: { title: newTitle, nestedExample: { foo1: newFoo1, foo2: newFoo2 } }
    });
    let b1 = await t.Book.getDoc(bookId);
    if (!b1) {
      throw 'No object found';
    }
    // @ts-ignore
    delete b1['__updatedAtMS'];
    assert.deepStrictEqual(stable(b1), stable(expectedUpdated));
  });

  test('update shallow object (disabled field)', async () => {
    assert.rejects(async () => {
      await t.Book.updateShallow({ id: bookId, doc: { derived: { a: 'a', b: 1 } } });
    });
  });

  test('update shallow object (disabled field) with override', async () => {
    const d = { a: 'a', b: Math.random() };
    await t.Book.updateShallow({ id: bookId, doc: { derived: d } }, { allowWritesToAllPaths: true });
    let b1 = await t.Book.getDoc(bookId);
    if (!b1) {
      throw 'No object found';
    }
    assert.deepStrictEqual(stable(b1.derived), stable(d));
  });

  test('delete object', async () => {
    await t.Book.delete({ id: bookId });
    let b1 = await t.Book.getDoc(bookId);
    if (b1) {
      throw 'Book should be deleted';
    }
  });

  const person1: Person = {
    id: t.Person.generateId(),
    age: 30,
    createdAtMS: Date.now(),
    favFoods: { american: 'a1', asian: 'a2' },
    name: 'Bob',
    updatedAtMS: Date.now(),
    weight: 100
  };
  run(async () => {
    await reset();
    await t.Person.add({
      doc: {
        id: person1.id,
        age: 30,
        createdAtMS: Date.now(),
        favFoods: { american: 'a1', asian: 'a2' },
        name: 'Bob',
        updatedAtMS: Date.now(),
        weight: 100
      }
    });
  });

  test('set', async () => {
    let p1: Person = {
      age: 34,
      createdAtMS: Date.now(),
      favFoods: {},
      id: t.Person.generateId(),
      name: 'Bob1',
      updatedAtMS: Date.now(),
      weight: 123
    };
    let p2: Person = {
      age: 4,
      createdAtMS: Date.now(),
      favFoods: { american: 'cheese' },
      id: p1.id,
      name: 'Bob2',
      updatedAtMS: Date.now(),
      weight: 100
    };
    await t.Person.set({ id: p1.id, doc: p1 });
    const r1Doc = await t.Person.getDoc(p1.id);
    // @ts-ignore
    delete r1Doc['__updatedAtMS'];
    assert.deepStrictEqual(jsonStable(r1Doc), jsonStable(p1));

    await t.Person.set({ id: p2.id, doc: p2 });
    const r2Doc = await t.Person.getDoc(p2.id);
    // @ts-ignore
    delete r2Doc['__updatedAtMS'];
    assert.deepStrictEqual(jsonStable(r2Doc), jsonStable(p2));
  });

  test('set path', async () => {
    await t.Person.setPath({ id: person1.id, pathObj: { favFoods: true }, value: { favFoods: { italian: 'pizza' } } });
    const person = await t.Person.getDoc(person1.id);
    // Make sure the other two nodes have been removed
    if (person) {
      assert.strictEqual(Object.keys(person.favFoods).length, 1);
      assert.strictEqual(person.favFoods.italian, 'pizza');
    } else {
      throw 'No person found';
    }
  });

  test('increment field', async () => {
    await t.Person.update({ id: person1.id, doc: { age: t._MagicIncrementValue } });
    const person = await t.Person.getDoc(person1.id);
    assert.strictEqual(person?.age, person1.age + 1);
  });

  test('delete field', async () => {
    await t.Person.update({ id: person1.id, doc: { name: t._MagicDeleteValue } });
    const person = await t.Person.getDoc(person1.id);
    assert.strictEqual(person && person.name === undefined, true);
  });
});

// Batches
// Check the metrics

describe('Batches/Queries/Subscriptions', () => {
  const people: Person[] = [
    {
      id: t.Person.generateId(),
      age: 36,
      favFoods: { american: 'cheese burger', asian: 'sushi', italian: 'pizza' },
      name: 'Kevin',
      weight: 220,
      createdAtMS: Date.now(),
      updatedAtMS: Date.now()
    },
    {
      id: t.Person.generateId(),
      age: 3,
      favFoods: { american: 'cheese burger', asian: 'rice', italian: 'cheese stick' },
      name: 'Henry',
      weight: 33,
      createdAtMS: Date.now(),
      updatedAtMS: Date.now()
    },
    {
      id: t.Person.generateId(),
      age: 33,
      favFoods: { american: 'chicken', asian: 'sushi', italian: 'lasagna' },
      name: 'Karoline',
      weight: 140,
      createdAtMS: Date.now(),
      updatedAtMS: Date.now()
    },
    {
      id: t.Person.generateId(),
      age: 5,
      favFoods: { american: 'cheese burger', asian: 'sushi', italian: 'lasagna' },
      name: 'Elaine',
      weight: 45,
      createdAtMS: Date.now(),
      updatedAtMS: Date.now()
    },
    {
      id: t.Person.generateId(),
      age: 1,
      favFoods: { american: 'mac n cheese', asian: 'rice', italian: 'lasagna' },
      name: 'Hazel',
      weight: 20,
      createdAtMS: Date.now(),
      updatedAtMS: Date.now()
    }
  ];
  run(async () => {
    await reset();
    for (let i = 0; i < people.length; i++) {
      await t.Person.add({ doc: people[i] });
    }
  });

  test('basic getDocs', async () => {
    const r = await t.Person.getDocs([people[0].id, 'SHOULD_NOT_EXIST_ID', people[1].id]);
    assert.deepStrictEqual(r[0] ? r[0].id : '', people[0].id);
    assert.deepStrictEqual(r[1], null);
    assert.deepStrictEqual(r[2] ? r[2].id : '', people[1].id);
  });

  test('basic getDocs (empty array of docIds)', async () => {
    const r = await t.Person.getDocs([]);
    assert.deepStrictEqual(r.length, 0);
  });

  test('basic query', async () => {
    const r = await t.Person.query({});
    assert.strictEqual(r.docs.length, people.length);
  });
  test('single where condition', async () => {
    const expectedFood = 'cheese burger';
    const r = await t.Person.query({ where: [{ favFoods: { american: ['==', expectedFood] } }] });
    assert.strictEqual(r.docs.length, people.filter((p) => p.favFoods.american === expectedFood).length);
  });
  test('multiple where conditions', async () => {
    const expectedFood = 'cheese burger';
    const maxExpectedAge = 10;
    const r = await t.Person.query({
      where: [{ favFoods: { american: ['==', expectedFood] } }, { age: ['<=', maxExpectedAge] }]
    });
    assert.strictEqual(
      r.docs.length,
      people.filter((p) => p.favFoods.american === expectedFood && p.age <= maxExpectedAge).length
    );
  });

  test('where condition for IN', async () => {
    const inArr: number[] = [1, 2, 3, 4];
    const r = await t.Person.query({
      where: [{ age: ['in', inArr] }]
    });
    assert.strictEqual(r.docs.length, people.filter((p) => inArr.includes(p.age)).length);
  });

  test('orderBy (asc)', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }]
    });
    assert.strictEqual(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => a.age - b.age)
        .map((p) => p.id)
        .join('')
    );
  });
  test('orderBy (desc)', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true }, dir: 'desc' }]
    });
    assert.strictEqual(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => b.age - a.age)
        .map((p) => p.id)
        .join('')
    );
  });

  test('orderBy with startAfter', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }],
      startAfter: [10]
    });

    assert.strictEqual(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => a.age - b.age)
        .filter((a) => a.age > 10)
        .map((p) => p.id)
        .join('')
    );
  });

  test('orderBy with startAt', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }],
      startAt: [5]
    });
    assert.strictEqual(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => a.age - b.age)
        .filter((a) => a.age >= 5)
        .map((p) => p.id)
        .join('')
    );
  });

  test('orderBy with endBefore', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }],
      endBefore: [10]
    });
    assert.strictEqual(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => a.age - b.age)
        .filter((a) => a.age < 10)
        .map((p) => p.id)
        .join('')
    );
  });

  test('orderBy with endAt', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }],
      endAt: [5]
    });
    assert.strictEqual(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => a.age - b.age)
        .filter((a) => a.age <= 5)
        .map((p) => p.id)
        .join('')
    );
  });

  test('limit', async () => {
    const r = await t.Person.query({
      limit: 2
    });
    assert.strictEqual(r.docs.length, 2);
  });

  test('pagination', async () => {
    const result: Person[] = [];
    let batchSize = 2;
    let totalResultSets = 0;
    let pendingQuery: SimpleQuery<Person> = {
      limit: batchSize
    };
    while (true) {
      totalResultSets += 1;
      const r = await t.Person.query(pendingQuery);
      result.push(...r.docs);
      if (r.nextQuery) {
        pendingQuery = r.nextQuery;
      } else {
        break;
      }
    }

    assert.strictEqual(result.length, people.length);
    assert.strictEqual(totalResultSets, Math.ceil(people.length / batchSize));
  });

  test('multi query', async () => {
    const r = await t.Person.multiQuery({
      queries: [{ where: [{ age: ['==', 1] }] }, { where: [{ favFoods: { american: ['==', 'cheese burger'] } }] }]
    });

    const q1 = people.filter((p) => p.age === 1);
    const q2 = people.filter((p) => p.favFoods.american === 'cheese burger');
    assert.strictEqual(
      r.docs
        .map((d) => d.id)
        .sort()
        .join(),
      [...q1, ...q2]
        .map((p) => p.id)
        .sort()
        .join()
    );
  });

  test('multi query (empty array of queries)', async () => {
    const r = await t.Person.multiQuery({ queries: [] });
    assert.strictEqual(r.docs.length, 0);
  });

  test('multi query with sort', async () => {
    const r = await t.Person.multiQuery({
      queries: [{ where: [{ age: ['>=', 3] }] }],
      mergeProcess: {
        orderBy: { sortKey: 'age', dir: 'asc' }
      }
    });

    assert.strictEqual(
      r.docs.map((d) => d.id).join(),
      _.sortBy(
        people.filter((p) => p.age >= 3),
        'age'
      )
        .map((p) => p.id)
        .join()
    );
  });

  test('multi query with no dedupe', async () => {
    const r = await t.Person.multiQuery({
      queries: [{ where: [{ age: ['>=', 3] }] }, { where: [{ age: ['>=', 10] }] }]
    });
    assert.strictEqual(
      r.docs.length,
      [...people.filter((p) => p.age >= 3), ...people.filter((p) => p.age >= 10)].length
    );
  });

  test('multi query with dedupe', async () => {
    const r = await t.Person.multiQuery({
      queries: [{ where: [{ age: ['>=', 3] }] }, { where: [{ age: ['>=', 10] }] }],
      mergeProcess: {
        runDedupe: true
      }
    });
    assert.strictEqual(
      r.docs.length,
      _.uniqBy([...people.filter((p) => p.age >= 3), ...people.filter((p) => p.age >= 10)], 'id').length
    );
  });

  test('doc subscription', () => {
    let pass = 0;
    return new Promise(async (resolve, reject) => {
      let person: Person = {
        age: 23,
        createdAtMS: Date.now(),
        favFoods: {},
        id: t.Person.generateId(),
        name: 'Bob',
        weight: 34,
        updatedAtMS: Date.now()
      };
      await t.Person.add({ doc: person });

      const subRef = t.Person.docSubscription(person.id);

      subRef.subscribe(
        async (r) => {
          if (!r) {
            return;
          }
          pass += 1;
          if (pass === 1) {
            try {
              // @ts-ignore
              delete r['__updatedAtMS'];
              assert.deepStrictEqual(jsonStable(r), jsonStable(person));
              await t.Person.update({ id: person.id, doc: { age: 100 } });
            } catch (e) {
              reject(e);
            }
          } else if (pass === 2) {
            assert.deepStrictEqual(r.age, 100);
            await t.Person.delete({ id: person.id });
            resolve();
          }
        },
        (e) => {
          reject(e);
        }
      );
    });
  });

  test('doc subscription (id does not exist)', () => {
    return new Promise(async (resolve, reject) => {
      const subRef = t.Person.docSubscription('id_does_not_exist');
      subRef.subscribe(
        async (r) => {
          assert.deepStrictEqual(r, null);
          resolve();
        },
        (e) => {
          reject(e);
        }
      );
    });
  });

  test('docs subscription', () => {
    return new Promise(async (resolve, reject) => {
      const ref = t.Person.docsSubscription([people[0].id, 'SHOULD_NOT_EXIST_ID', people[1].id]);
      let pass = 0;
      ref.subscribe(
        async (docs) => {
          pass += 1;
          if (pass === 1) {
            assert.deepStrictEqual(docs[0] ? docs[0].id : '', people[0].id);
            assert.deepStrictEqual(docs[1], null);
            assert.deepStrictEqual(docs[2] ? docs[2].id : '', people[1].id);
            await t.Person.update({ id: people[0].id, doc: { name: 'Heber' } });
          } else if (pass === 2) {
            assert.deepStrictEqual(docs[0] ? docs[0].name : '', 'Heber');
            resolve();
          }
        },
        (e) => {
          reject(e);
        }
      );
    });
  });

  test('docs subscription (empty array)', () => {
    return new Promise(async (resolve, reject) => {
      const ref = t.Person.docsSubscription([]);
      ref.subscribe(
        async (docs) => {
          assert.deepStrictEqual(docs.length, 0);
          resolve();
        },
        (e) => {
          reject(e);
        }
      );
    });
  });

  test('query subscription', () => {
    let pass = 0;
    return new Promise(async (resolve, reject) => {
      let extraPerson: Person = {
        age: 44,
        createdAtMS: Date.now(),
        favFoods: {},
        id: t.Person.generateId(),
        name: 'Bob',
        updatedAtMS: Date.now(),
        weight: 100
      };
      try {
        assert.deepStrictEqual(0, Object.keys(t.Book._stats.activeSubscriptions).length);

        let ref = t.Person.querySubscription({ where: [{ age: ['>=', 10] }] });
        let sub = ref.subscribe(
          async (val) => {
            pass += 1;
            try {
              if (pass === 1) {
                let x = val.docs
                  .map((d) => d.id)
                  .sort()
                  .join('');
                let y = people
                  .filter((p) => p.age >= 10)
                  .map((p) => p.id)
                  .sort()
                  .join('');
                // Check initial subscription
                assert.deepStrictEqual(x, y);

                await t.Person.add({
                  doc: extraPerson
                });
              } else if (pass === 2) {
                let x = val.docs
                  .map((d) => d.id)
                  .sort()
                  .join('');
                let y = [...people, extraPerson]
                  .filter((p) => p.age >= 10)
                  .map((p) => p.id)
                  .sort()
                  .join('');
                assert.deepStrictEqual(x, y);
                sub.unsubscribe();
                await t.Person.delete({ id: extraPerson.id });
                resolve();
              }
            } catch (e) {
              reject(e);
            }
          },
          (e) => reject(e)
        );
      } catch (e) {
        reject(e);
      }
    });
  });

  test('multi query subscription', () => {
    let pass = 0;
    return new Promise(async (resolve, reject) => {
      let extraPerson: Person = {
        age: 44,
        createdAtMS: Date.now(),
        favFoods: {},
        id: t.Person.generateId(),
        name: 'Bob',
        updatedAtMS: Date.now(),
        weight: 100
      };
      try {
        assert.deepStrictEqual(0, Object.keys(t.Book._stats.activeSubscriptions).length);

        let ref = t.Person.multiQuerySubscription({
          queries: [{ where: [{ age: ['>=', 10] }] }, { where: [{ age: ['<=', 1] }] }]
        });
        let sub = ref.subscribe(
          async (val) => {
            pass += 1;
            try {
              if (pass === 1) {
                let x = val.docs
                  .map((d) => d.id)
                  .sort()
                  .join('');
                let y = people
                  .filter((p) => p.age >= 10 || p.age <= 1)
                  .map((p) => p.id)
                  .sort()
                  .join('');
                // Check initial subscription
                assert.deepStrictEqual(x, y);

                await t.Person.add({
                  doc: extraPerson
                });
              } else if (pass === 2) {
                let x = val.docs
                  .map((d) => d.id)
                  .sort()
                  .join('');
                let y = [...people, extraPerson]
                  .filter((p) => p.age >= 10 || p.age <= 1)
                  .map((p) => p.id)
                  .sort()
                  .join('');
                assert.deepStrictEqual(x, y);
                sub.unsubscribe();
                resolve();
              }
            } catch (e) {
              reject(e);
            }
          },
          (e) => reject(e)
        );
      } catch (e) {
        reject(e);
      }
    });
  });

  test('multi query subscription (empty array)', () => {
    return new Promise(async (resolve, reject) => {
      try {
        let ref = t.Person.multiQuerySubscription({
          queries: []
        });
        ref.subscribe(
          async (val) => {
            assert.strictEqual(val.docs.length, 0);
            resolve();
          },
          (e) => reject(e)
        );
      } catch (e) {
        reject(e);
      }
    });
  });
});
