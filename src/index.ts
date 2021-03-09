import path, { join } from 'path';

import {
  setFailed, getInput, info, debug,
} from '@actions/core';
import { issueCommand } from '@actions/core/lib/command';

import { exec, ExecOptions } from '@actions/exec';
import getChangedFiles from './getChangedFiles';

// eslint-disable-next-line max-statements
const run = async () => {
  const token = process.env.GITHUB_TOKEN;

  const matcherFile = join(__dirname, '..', '.github', 'stylelint-matcher.json');
  issueCommand(
    'add-matcher',
    {},
    matcherFile,
  );

  if (!token) {
    return setFailed('GITHUB_TOKEN not found in environment variables.');
  }

  const enableAnnotations = getInput('annotations') === 'true';
  if (!enableAnnotations) {
    debug('Disabling Annotations');
    info('##[remove-matcher owner=eslint-compact]');
    info('##[remove-matcher owner=eslint-stylish]');
  }

  const enabledLinters = getInput('enabledLinters').split(',').map((linter) => linter.trim());

  const [eslintFiles,
    stylelintFiles,
    tscFilesAndConfigs] = await getChangedFiles(token, enabledLinters);

  debug('Files for linting...');
  eslintFiles.forEach(debug);

  if (eslintFiles.length === 0 && stylelintFiles.length === 0 && tscFilesAndConfigs.length === 0) {
    return info('No files found. Skipping');
  }

  const eslintArgs = getInput('eslintArgs');

  let runErr: Error | undefined;

  if (enabledLinters.includes('eslint') && eslintFiles.length > 0) {
    try {
      await exec('npx', [
        path.join('eslint'),
        ...eslintFiles,
        eslintArgs,
      ].filter(Boolean));
    } catch (err) {
      runErr = err;
    }
  }

  if (enabledLinters.includes('stylelint') && stylelintFiles.length > 0) {
    try {
      await exec('npx', [
        path.join('stylelint'),
        ...stylelintFiles,
      ].filter(Boolean));
    } catch (err) {
      runErr = err;
    }
  }

  if (enabledLinters.includes('tsc')) {
    for (const conf of tscFilesAndConfigs) {
      // const outStream = new Writable({ decodeStrings: true });
      // outStream.on()
      const options: ExecOptions = {};
      options.silent = true;
      options.listeners = {
        // eslint-disable-next-line no-loop-func
        stdline: (data: string) => {
          const outLine = data;
          if (conf.baseFiles.includes(outLine.split('(')[0])) {
            process.stdout.write(`${data}\n`);
          }
        },
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        await exec(`npx tsc --noEmit -p ${conf.configPath}`, undefined, options);
      } catch (err) {
        runErr = err;
      }
    }
  }

  if (runErr) {
    // return setFailed(runErr.message);
    info('linting failed');
  }

  return process.exit(0);
};

run();
