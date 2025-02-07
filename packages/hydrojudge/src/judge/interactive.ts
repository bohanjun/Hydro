import Queue from 'p-queue';
import fs from 'fs-extra';
import { argv } from 'yargs';
import * as STATUS from '../status';
import { parse } from '../testlib';
import { findFileSync, parseFilename } from '../utils';
import { run } from '../sandbox';
import compile from '../compile';
import signals from '../signals';
import { getConfig } from '../config';

const testlibSrc = findFileSync('@hydrooj/hydrojudge/vendor/testlib/testlib.h');
const Score = {
    sum: (a, b) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeCase(c) {
    return async (ctx, ctxSubtask) => {
        ctx.executeInteractor.copyIn.in = c.input ? { src: c.input } : { content: '' };
        ctx.executeInteractor.copyIn.out = c.output ? { src: c.output } : { content: '' };
        const [{ code, time_usage_ms, memory_usage_kb }, resInteractor] = await run([
            {
                execute: ctx.executeUser.execute.replace(/\$\{name\}/g, 'code'),
                copyIn: ctx.executeUser.copyIn,
                time: ctxSubtask.subtask.time,
                memory: ctxSubtask.subtask.memory,
            }, {
                execute: `${ctx.executeInteractor.execute.replace(/\$\{name\}/g, 'interactor')} /w/in /w/tout`,
                copyIn: ctx.executeInteractor.copyIn,
                time: ctxSubtask.subtask.time * 2,
                memory: ctxSubtask.subtask.memory * 2,
            },
        ]);
        let status;
        let score = 0;
        let message: any = '';
        if (time_usage_ms > ctxSubtask.subtask.time) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory_usage_kb > ctxSubtask.subtask.memory * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else if (code) {
            status = STATUS.STATUS_RUNTIME_ERROR;
            if (code < 32) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        } else {
            const result = parse(resInteractor.files.stderr, ctx.config.score);
            status = result.status;
            score = result.score;
            message = result.message;
        }
        ctxSubtask.score = Score[ctxSubtask.subtask.type](ctxSubtask.score, score);
        ctxSubtask.status = Math.max(ctxSubtask.status, status);
        ctx.total_time_usage_ms += time_usage_ms;
        ctx.total_memory_usage_kb = Math.max(ctx.total_memory_usage_kb, memory_usage_kb);
        ctx.next({
            status: STATUS.STATUS_JUDGING,
            case: {
                status,
                score: 0,
                time_ms: time_usage_ms,
                memory_kb: memory_usage_kb,
                message,
            },
            progress: Math.floor((c.id * 100) / ctx.config.count),
        });
    };
}

function judgeSubtask(subtask) {
    return async (ctx) => {
        subtask.time *= ctx.time_limit_rate;
        subtask.type = subtask.type || 'min';
        const ctxSubtask = {
            subtask,
            status: 0,
            score: subtask.type === 'min'
                ? subtask.score
                : 0,
        };
        const cases = [];
        for (const cid in subtask.cases) {
            cases.push(ctx.queue.add(() => judgeCase(subtask.cases[cid])(ctx, ctxSubtask)));
        }
        await Promise.all(cases);
        ctx.total_status = Math.max(ctx.total_status, ctxSubtask.status);
        ctx.total_score += ctxSubtask.score;
    };
}

export const judge = async (ctx) => {
    ctx.next({ status: STATUS.STATUS_COMPILING });
    ctx.time_limit_rate = ctx.getLang(ctx.lang).time_limit_rate;
    [ctx.executeUser, ctx.executeInteractor] = await Promise.all([
        (async () => {
            const copyIn = {};
            for (const file of ctx.config.user_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            return await compile(ctx.getLang(ctx.lang), ctx.code, 'code', copyIn, ctx.next);
        })(),
        (async () => {
            const copyIn = { 'testlib.h': { src: testlibSrc } };
            for (const file of ctx.config.judge_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            return await compile(
                ctx.getLang(parseFilename(ctx.config.interactor).split('.')[1]),
                fs.readFileSync(ctx.config.interactor).toString(),
                'interactor',
                copyIn,
            );
        })(),
    ]);
    ctx.clean.push(ctx.executeUser.clean, ctx.executeInteractor.clean);
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const tasks = [];
    ctx.total_status = ctx.total_score = ctx.total_memory_usage_kb = ctx.total_time_usage_ms = 0;
    ctx.queue = new Queue({ concurrency: getConfig('parallelism') });
    for (const sid in ctx.config.subtasks) {
        tasks.push(judgeSubtask(ctx.config.subtasks[sid])(ctx));
    }
    await Promise.all(tasks);
    ctx.stat.done = new Date();
    if (argv.debug) ctx.next({ message: JSON.stringify(ctx.stat) });
    console.log({
        status: ctx.total_status,
        score: ctx.total_score,
        time_ms: ctx.total_time_usage_ms,
        memory_kb: ctx.total_memory_usage_kb,
    });
    ctx.end({
        status: ctx.total_status,
        score: ctx.total_score,
        time_ms: ctx.total_time_usage_ms,
        memory_kb: ctx.total_memory_usage_kb,
    });
};
