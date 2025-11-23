// Abort Render buildpack deployments that do not use the Docker runtime
const runningOnRender = Boolean(
  process.env.RENDER === 'true' ||
    process.env.RENDER_EXTERNAL_HOSTNAME ||
    process.env.RENDER_SERVICE_ID ||
    process.env.RENDER_GIT_BRANCH
);

// If the build is happening inside a Docker image build, we should not block it
const insideDocker = Boolean(process.env.DOCKER_CONTAINER || process.env.DOCKER_ENV || process.env.CI_PIPELINE_SOURCE === 'docker');

const runtimeHint = (process.env.RENDER_RUNTIME || process.env.RENDER_SERVICE_TYPE || '').toLowerCase();
const explicitDockerRuntime = runtimeHint.includes('docker');

if (runningOnRender && !insideDocker && !explicitDockerRuntime) {
  const message = [
    '🚫 Render detected a non-Docker build. This service must deploy with the Docker runtime.',
    '-> Fix: redeploy via the Render blueprint or create a new service with Runtime set to Docker.',
    '-> Dockerfile: ./Dockerfile (uses port 3000, respects $PORT)',
  ].join('\n');
  console.error(message);
  process.exit(1);
}
