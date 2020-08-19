import { describe, test, setOptions, otest, run } from 'nano-test-runner';
import { getTestFirestoreLift, reset, Person } from './helpers';
import * as _ from 'lodash';
import * as assert from 'assert';
import * as jsonStable from 'json-stable-stringify';
import { SimpleQuery } from '../models';

setOptions({ runPattern: 'serial', suppressConsole: false });

const t = getTestFirestoreLift();

describe('Basic CRUD', () => {
  const bookId = t.Book.generateId();

  run(async () => await reset());
  test('create doc', async () => {
    await reset();
    await t.Book.add({
      doc: {
        id: bookId,
        createdAtMS: Date.now(),
        updatedAtMS: Date.now(),
        title: 'The Cat and the Hat',
        totalPages: 34
      }
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
    await t.Book.update({ id: bookId, doc: { title: newTitle } });
    let b1 = await t.Book.getDoc(bookId);
    if (!b1) {
      throw 'No object found';
    }
    assert.deepEqual(b1.title, newTitle);
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
    assert.deepEqual(jsonStable(r1Doc), jsonStable(p1));

    await t.Person.set({ id: p2.id, doc: p2 });
    const r2Doc = await t.Person.getDoc(p2.id);
    assert.deepEqual(jsonStable(r2Doc), jsonStable(p2));
  });

  test('set path', async () => {
    await t.Person.setPath({ id: person1.id, pathObj: { favFoods: true }, value: { favFoods: { italian: 'pizza' } } });
    const person = await t.Person.getDoc(person1.id);
    // Make sure the other two nodes have been removed
    if (person) {
      assert.equal(Object.keys(person.favFoods).length, 1);
      assert.equal(person.favFoods.italian, 'pizza');
    } else {
      throw 'No person found';
    }
  });

  test('increment field', async () => {
    await t.Person.update({ id: person1.id, doc: { age: t._MagicIncrementValue } });
    const person = await t.Person.getDoc(person1.id);
    assert.equal(person?.age, person1.age + 1);
  });

  test('delete field', async () => {
    await t.Person.update({ id: person1.id, doc: { name: t._MagicDeleteValue } });
    const person = await t.Person.getDoc(person1.id);
    assert.equal(person && person.name === undefined, true);
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
    assert.deepEqual(r[0] ? r[0].id : '', people[0].id);
    assert.deepEqual(r[1], null);
    assert.deepEqual(r[2] ? r[2].id : '', people[1].id);
  });

  test('basic query', async () => {
    const r = await t.Person.query({});
    assert.equal(r.docs.length, people.length);
  });
  test('single where condition', async () => {
    const expectedFood = 'cheese burger';
    const r = await t.Person.query({ where: [{ favFoods: { american: ['==', expectedFood] } }] });
    assert.equal(r.docs.length, people.filter((p) => p.favFoods.american === expectedFood).length);
  });
  test('multiple where conditions', async () => {
    const expectedFood = 'cheese burger';
    const maxExpectedAge = 10;
    const r = await t.Person.query({
      where: [{ favFoods: { american: ['==', expectedFood] } }, { age: ['<=', maxExpectedAge] }]
    });
    assert.equal(
      r.docs.length,
      people.filter((p) => p.favFoods.american === expectedFood && p.age <= maxExpectedAge).length
    );
  });

  test('where condition for IN', async () => {
    const inArr: number[] = [1, 2, 3, 4];
    const r = await t.Person.query({
      where: [{ age: ['in', inArr] }]
    });
    assert.equal(r.docs.length, people.filter((p) => inArr.includes(p.age)).length);
  });

  test('orderBy (asc)', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }]
    });
    assert.equal(
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
    assert.equal(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => b.age - a.age)
        .map((p) => p.id)
        .join('')
    );
  });

  test('orderBy with startAfterValue', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }],
      startAfterValue: [10]
    });
    assert.equal(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => a.age - b.age)
        .filter((a) => a.age > 10)
        .map((p) => p.id)
        .join('')
    );
  });

  test('orderBy with startAtValue', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }],
      startAtValue: [5]
    });
    assert.equal(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => a.age - b.age)
        .filter((a) => a.age >= 5)
        .map((p) => p.id)
        .join('')
    );
  });

  test('orderBy with endBeforeValue', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }],
      endBeforeValue: [10]
    });
    assert.equal(
      r.docs.map((p) => p.id).join(''),
      people
        .sort((a, b) => a.age - b.age)
        .filter((a) => a.age < 10)
        .map((p) => p.id)
        .join('')
    );
  });

  test('orderBy with endAtValue', async () => {
    const r = await t.Person.query({
      orderBy: [{ pathObj: { age: true } }],
      endAtValue: [5]
    });
    assert.equal(
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
    assert.equal(r.docs.length, 2);
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

    assert.equal(result.length, people.length);
    assert.equal(totalResultSets, Math.ceil(people.length / batchSize));
  });

  test('multi query', async () => {
    const expectedFood = 'cheese burger';
    const r = await t.Person.multiQuery({
      queries: [{ where: [{ age: ['==', 1] }] }, { where: [{ favFoods: { american: ['==', 'cheese burger'] } }] }]
    });

    const q1 = people.filter((p) => p.age === 1);
    const q2 = people.filter((p) => p.favFoods.american === 'cheese burger');
    assert.equal(
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

  test('multi query with sort', async () => {
    const r = await t.Person.multiQuery({
      queries: [{ where: [{ age: ['>=', 3] }] }],
      mergeProcess: {
        orderBy: { sortKey: 'age', dir: 'asc' }
      }
    });

    assert.equal(
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
    assert.equal(r.docs.length, [...people.filter((p) => p.age >= 3), ...people.filter((p) => p.age >= 10)].length);
  });

  test('multi query with dedupe', async () => {
    const r = await t.Person.multiQuery({
      queries: [{ where: [{ age: ['>=', 3] }] }, { where: [{ age: ['>=', 10] }] }],
      mergeProcess: {
        runDedupe: true
      }
    });
    assert.equal(
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
              assert.deepEqual(jsonStable(r), jsonStable(person));
              await t.Person.update({ id: person.id, doc: { age: 100 } });
            } catch (e) {
              reject(e);
            }
          } else if (pass === 2) {
            assert.deepEqual(r.age, 100);
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

  test('docs subscription', () => {
    return new Promise(async (resolve, reject) => {
      const ref = t.Person.docsSubscription([people[0].id, 'SHOULD_NOT_EXIST_ID', people[1].id]);
      let pass = 0;
      ref.subscribe(
        async (docs) => {
          pass += 1;
          if (pass === 1) {
            assert.deepEqual(docs[0] ? docs[0].id : '', people[0].id);
            assert.deepEqual(docs[1], null);
            assert.deepEqual(docs[2] ? docs[2].id : '', people[1].id);
            await t.Person.update({ id: people[0].id, doc: { name: 'Heber' } });
          } else if (pass === 2) {
            assert.deepEqual(docs[0] ? docs[0].name : '', 'Heber');
            resolve();
          }
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
        assert.deepEqual(0, Object.keys(t.Book._stats.activeSubscriptions).length);

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
                assert.deepEqual(x, y);

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
                assert.deepEqual(x, y);
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
        assert.deepEqual(0, Object.keys(t.Book._stats.activeSubscriptions).length);

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
                assert.deepEqual(x, y);

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
                assert.deepEqual(x, y);
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
});
