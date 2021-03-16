import { debug, getInput } from '@actions/core';
import { getOctokit, context } from '@actions/github';
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';

type FileList = string[];
type TscConfigList = {
  baseFiles: string[];
  configPath: string;
}[];
type File = {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
  raw_url: string;
  blob_url: string;
  patch: string;
};

const getFiles = (files: File[]): FileList => files
  .filter((file) => file.status !== 'removed')
  .map((file) => file.filename);

const getEslintFiles = (files: FileList) => {
  return files.filter((filename) => new Set(getInput('eslintExtensions').split(',').map((ext) => ext.trim())).has(filename.split('.').slice(-1)[0]));
};

const getStylelintFiles = (files: FileList) => {
  return files.filter((filename) => new Set(getInput('stylelintExtensions').split(',').map((ext) => ext.trim())).has(filename.split('.').slice(-1)[0]));
};

const getTscFilesAndConfigs = (files: FileList) => {
  return getInput('tscConfigs').split(',').map((tuple) => {
    const [basePath, configPath] = tuple.trim().split(':').map((str) => str.trim());
    return { basePath, configPath };
  }).map((tuple) => {
    const baseFiles = files.filter((filename) => filename.indexOf(tuple.basePath) === 0).filter((filename) => filename.split('.').slice(-1)[0] === 'ts');
    return { baseFiles, configPath: tuple.configPath };
  })
    .filter((tuple) => tuple.baseFiles.length > 0);
};

const getChangedFiles = async (token: string, enabledLinters: string[]):
Promise<[FileList, FileList, TscConfigList]> => {
  const octokit = getOctokit(token);
  const pullRequest = context.payload.pull_request;
  debug(JSON.stringify(context.payload.pull_request));
  let files: FileList;
  if (!pullRequest?.number) {
    const options = octokit.repos.getCommit.endpoint.merge({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: context.sha,
    });

    type ReposGetCommitResponseData = GetResponseDataTypeFromEndpointMethod<
      typeof octokit.repos.getCommit
    >;
    const response: ReposGetCommitResponseData[] = await octokit.paginate(
      options,
    );
    const filesArr = response.map((data) => data.files);

    const filesChangedInCommit = filesArr.reduce(
      (acc, val) => acc?.concat(val || []),
      [],
    );
    files = getFiles(filesChangedInCommit as File[]);
  } else {
    const options = octokit.pulls.listFiles.endpoint.merge({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: pullRequest.number,
    });

    type PullsListFilesResponseData = GetResponseDataTypeFromEndpointMethod<
      typeof octokit.pulls.listFiles
    >;
    const prResponse: PullsListFilesResponseData = await octokit.paginate(
      options,
    );
    files = getFiles(prResponse as File[]);
  }

  debug('Files changed...');
  files.forEach(debug);

  const eslintFiles = enabledLinters.includes('eslint') ? getEslintFiles(files) : [];
  const stylelintFiles = enabledLinters.includes('stylelint') ? getStylelintFiles(files) : [];

  const tscFilesAndConfigs = enabledLinters.includes('tsc') ? getTscFilesAndConfigs(files) : [];

  return [eslintFiles, stylelintFiles, tscFilesAndConfigs];
};

export default getChangedFiles;
