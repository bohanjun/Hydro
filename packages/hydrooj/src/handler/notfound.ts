/* eslint-disable no-empty-function */
/* eslint-disable class-methods-use-this */
import { NotFoundError } from '../error';
import { Route, Handler } from '../service/server';

class NotFoundHandler extends Handler {
    prepare() {
        throw new NotFoundError(this.request.path);
    }

    all() { }
}

export async function apply() {
    Route('notfound', '(/.*)+', NotFoundHandler);
}

global.Hydro.handler.notfound = apply;
