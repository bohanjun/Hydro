/* eslint-disable @typescript-eslint/no-shadow */
import cluster from 'cluster';
import { argv } from 'yargs';
import * as bus from './service/bus';

const disabledTerminal = argv.legacy || argv._.length || process.env.NODE_ENV === 'test';

export namespace Progress {
    export class Progress {
        constructor(public args) {
            console.log('progress start: ', args);
        }

        startItem(args) {
            console.log('progress: ', this.args, args);
        }

        itemDone(args) {
            console.log('done: ', this.args, args);
        }

        stop() {
            console.log('stop', this.args);
        }
    }

    export function create(args) {
        return new Progress(args);
    }
}

async function terminate() {
    let hasError = false;
    try {
        await bus.parallel('app/exit');
    } catch (e) {
        hasError = true;
    }
    process.exit(hasError ? 1 : 0);
}
process.on('SIGINT', terminate);
if (cluster.isMaster) {
    if (!disabledTerminal) console.log('Not running in a terminal environment. Interactive mode disabled.');
    bus.on('message/log', (message) => {
        process.stdout.write(`${message}\n`);
    });
    if (process.env.NODE_ENV !== 'test') {
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (buf) => {
            const input = buf.toString();
            if (input[0] === '@') {
                for (const i in cluster.workers) {
                    cluster.workers[i].send({ event: 'message/run', payload: [input.substr(1, input.length - 1)] });
                    break;
                }
            } else bus.parallel('message/run', input);
        });
    }
}
