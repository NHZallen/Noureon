// The one way a sandbox container is started. Nothing in a request can change these: the image, the limits and the mounts are the
// runner's; a request only brings code and files.

const NAME = /^[a-z0-9-]{8,64}$/;

export function containerName(sessionId) {
  const name = `nsb-${sessionId}`;
  if (!NAME.test(name)) throw new Error('Not a session id.');
  return name;
}

/** Arguments of `docker run` for a session whose folders are at `dirs` ({ input, output, cli, net }). */
export function dockerRunArgs({ config, sessionId, dirs, language }) {
  const name = containerName(sessionId);
  const tmp = (size) => `rw,noexec,nosuid,nodev,size=${size}`;
  return [
    'run', '-i', '--rm', '--name', name,
    // No network at all (what a tool may reach goes through the runner's proxy, by the socket in /run/noureon-net), no way to gain rights,
    // nothing but the folders below to write to.
    '--network', 'none',
    '--user', config.owner,
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', String(config.pids),
    '--memory', config.memory, '--memory-swap', config.memory,
    '--cpus', config.cpus,
    '--ulimit', 'nofile=1024:1024', '--ulimit', 'core=0',
    '--tmpfs', `/tmp:${tmp(config.tmpSize)}`,
    '--tmpfs', `/work:${tmp(config.workSize)},uid=${config.owner.split(':')[0]}`,
    // The Python packages a tool installs (pip --target /opt/pip): some are compiled and must be loaded, so this is the one writable place
    // that may run programs. It is memory, counted in the container's limit, and gone with the container.
    '--tmpfs', `/opt/pip:rw,exec,nosuid,nodev,size=${config.pipSize},uid=${config.owner.split(':')[0]}`,
    '-v', `${dirs.input}:/input:ro`,
    '-v', `${dirs.output}:/output:rw`,
    // The programs of the CLI tools: put there by the runner, only read (and run) in the container.
    '-v', `${dirs.cli}:/opt/cli:ro`,
    // The folders of the skills a reply loaded (mountSkills): written by the runner, only read in the container; /tmp and /work stay as they are, so a script is run by
    // an interpreter (python /skills/..) and nothing in the container becomes a program by being written.
    '-v', `${dirs.skills}:/skills:ro`,
    // The Python tools installed once on this machine (pip-cache.js): the whole cache, read only; a session is given a script for each tool it uses.
    '-v', `${config.pipCacheDir}:/opt/pip-cache:ro`,
    // The proxy's socket: the container may connect to it and nothing else.
    '-v', `${dirs.net}:/run/noureon-net:ro`,
    '-e', `LANGUAGE=${String(language || 'zh-TW').replace(/[^A-Za-z-]/g, '').slice(0, 12) || 'zh-TW'}`,
    '-e', 'HOME=/work', '-e', 'MPLCONFIGDIR=/tmp/mpl',
    '--stop-timeout', '1',
    config.image
  ];
}
