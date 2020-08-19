import { describe, test, setOptions, otest, run } from 'nano-test-runner';
import { getTestRtdbLift, Person } from './helpers';
import * as assert from 'assert';
import * as jsonStable from 'json-stable-stringify';

describe('Rtdb tests', () => {
  const t = getTestRtdbLift();

  const p1: Person = {
    age: 23,
    createdAtMS: Date.now(),
    favFoods: { american: 'burger' },
    id: 'a1',
    name: 'Bob',
    updatedAtMS: Date.now(),
    weight: 123
  };

  run(async () => {
    await t._RawRtdb.ref('/').remove();
  });

  test('object read/write', async () => {
    const ref = t.account('account/a1');
    await ref.set(p1);
    const v1 = (await ref.once('value')).val();
    assert.deepEqual(jsonStable(v1), jsonStable(p1));
  });

  test('object subscription/update', () => {
    return new Promise(async (resolve, reject) => {
      const ref = t.account('account/a2');
      await ref.set(p1);
      let pass = 0;
      ref.on('value', async (snap) => {
        try {
          pass += 1;
          const newName = 'Kevin';
          if (pass === 1) {
            await ref.update({ name: newName });
          } else if (pass === 2) {
            const v1 = snap.val();
            assert.deepEqual(v1 && v1.name, newName);
            resolve();
          }
        } catch (e) {
          reject(e);
        }
      });
    });
  });
});
