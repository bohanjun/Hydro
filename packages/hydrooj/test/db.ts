import 'hydrooj/src/loader';

jest.mock('hydrooj/src/service/db');

export async function connect() {
    const db = require('hydrooj/src/service/db');
    await db.start({});
    const scripts = require('hydrooj/src/upgrade').default;
    let dbVer = 0;
    const expected = scripts.length;
    while (dbVer < expected) {
        const func = scripts[dbVer];
        dbVer++;
        if (typeof func !== 'function' || func.toString().includes('_FRESH_INSTALL_IGNORE')) continue;
        // eslint-disable-next-line no-await-in-loop
        await func();
    }
}

export async function dispose() {
    const db = require('hydrooj/src/service/db');
    await db.stop();
}
