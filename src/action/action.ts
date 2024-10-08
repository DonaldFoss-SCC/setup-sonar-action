import { AxiosResponse } from 'axios';
import * as core from '@actions/core';
import ApiClient from '../api/api-client';
import { ActionInputs, ActionOutputKeys } from './types';
import { buildCreateProjectParams, buildLovedLivedBranchesParams, getInputs } from './utils';
import {
  CreateProjectParams,
  GetProjectsByProjectKeyResponse,
  PostLongLivedBranchesParams,
  Project,
} from '../api/types';

export async function run() {
  try {
    const inputs: ActionInputs = getInputs();

    const api: ApiClient = new ApiClient(inputs.sonarToken);
    const createProjectParams: CreateProjectParams = buildCreateProjectParams(inputs);

    const getProjectResponse: GetProjectsByProjectKeyResponse = await api.getProjectByProjectKey({
      organization: createProjectParams.organization,
      projects: [createProjectParams.project],
    });

    const projectExists: Project & { lastAnalysisDate: Date; revision: string } | undefined = getProjectResponse.components.find(
      (item: Project & { lastAnalysisDate: Date; revision: string }) => item.key === createProjectParams.project
    );
    
    if (projectExists) {
      core.setOutput(ActionOutputKeys.organization, projectExists.organization);
      core.setOutput(ActionOutputKeys.projectKey, projectExists.key);

      core.notice(
        `Project ${projectExists.key} already exists. No action performed.`
      );
      return core.ExitCode.Success;
    }

    const { project } = await api.createProject(createProjectParams);

    const shouldRenameMainBranch = inputs.mainBranch !== 'master';

    if (shouldRenameMainBranch) {
      await api.renameMasterBranch({
        name: inputs.mainBranch,
        project: project.key,
      });
    }

    if (inputs.longLivedBranchRegex.length > 1) {
      const postLongLivedBranchesParams: PostLongLivedBranchesParams = buildLovedLivedBranchesParams(inputs);
      const response: AxiosResponse = await api.setLongLivedBranches(postLongLivedBranchesParams);
      if (response.status)
        core.notice(`Set Long Lived branch name regex to "${inputs.longLivedBranchRegex}".`);
    }

    core.setOutput(
      ActionOutputKeys.organization,
      createProjectParams.organization
    );

    core.setOutput(ActionOutputKeys.projectKey, project.key);

    return core.ExitCode.Success;
  } catch (error) {
    core.debug(JSON.stringify(error));

    if (error instanceof Error) {
      core.error(error.message);
    } else {
      core.error(`Failed to complete action.`);
    }

    return core.ExitCode.Failure;
  }
}
