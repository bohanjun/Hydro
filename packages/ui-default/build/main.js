/* eslint-disable import/no-extraneous-dependencies */
import { argv } from 'yargs';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import gulp from 'gulp';
import log from 'fancy-log';
import chalk from 'chalk';
import root from './utils/root';
import gulpConfig from './config/gulp';
import webpackConfig from './config/webpack';

function runWebpack({
  watch, production, measure, dev,
}) {
  const compiler = webpack(webpackConfig({ watch, production, measure }));
  if (dev) {
    const server = new WebpackDevServer(compiler, {
      compress: true,
      hot: true,
      disableHostCheck: true,
      stats: 'none',
      index: '',
      proxy: {
        context: () => true,
        target: 'http://localhost:2333',
        ws: true,
      },
    });
    return server.listen(8000);
  }
  return new Promise((resolve, reject) => {
    function compilerCallback(err, stats) {
      if (err) {
        console.error(err.stack || err);
        if (err.details) console.error(err.details);
        reject(err);
      }
      if (argv.detail) console.log(stats.toString());
      if (!watch && (!stats || stats.hasErrors())) process.exitCode = 1;
      resolve();
    }
    if (watch) compiler.watch({}, compilerCallback);
    else compiler.run(compilerCallback);
  });
}

async function runGulp() {
  function handleError(err) {
    log(chalk.red('Error: %s'), chalk.reset(err.toString() + err.stack));
    if (err) process.exit(1);
  }
  const gulpTasks = gulpConfig({ production: true, errorHandler: handleError });
  return new Promise((resolve) => {
    const taskList = {};

    gulp.on('start', ({ uid, name }) => {
      log(chalk.blue('Starting task: %s'), chalk.reset(name));
      taskList[uid] = true;
    });
    gulp.on('stop', ({ uid, name }) => {
      log(chalk.green('Finished: %s'), chalk.reset(name));
      taskList[uid] = false;
      if (Object.values(taskList).filter((b) => b).length === 0) resolve();
    });
    gulpTasks.default();
  });
}

async function main() {
  const dir = process.cwd();
  process.chdir(root());
  await runGulp();
  await runWebpack(argv);
  process.chdir(dir);
}

module.exports = main;
