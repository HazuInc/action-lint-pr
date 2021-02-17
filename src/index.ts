import path, { join } from 'path';

import {
  setFailed, getInput, info, debug,
} from '@actions/core';
import { issueCommand } from '@actions/core/lib/command';

import { exec } from '@actions/exec';
import getChangedFiles from './getChangedFiles';

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

  const [eslintFiles, stylelintFiles] = await getChangedFiles(token);

  debug('Files for linting...');
  eslintFiles.forEach(debug);

  if (eslintFiles.length === 0 && stylelintFiles.length === 0) {
    return info('No files found. Skipping');
  }

  const eslintArgs = getInput('eslintArgs');

  let runErr: Error | undefined;

  if (eslintFiles.length > 0) {
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

  if (stylelintFiles.length > 0) {
    try {
      await exec('npx', [
        path.join('stylelint'),
        ...stylelintFiles,
      ].filter(Boolean));
    } catch (err) {
      runErr = err;
    }
  }

  if (runErr) {
    return setFailed(runErr.message);
  }

  return process.exit(0);
};

run();
