// The one way a sandbox container is started. Nothing in a request can change these: the image, the limits and the mounts are the
// runner's; a request only brings code and files.

const NAME = /^[a-z0-9-]{8,64}$/;

export function containerName(sessionId) {
  const name = `nsb-${sessionId}`;
  if (!NAME.test(name)) throw new Error('Not a session id.');
  return name;
}

/** Arguments of `docker run` for a session whose folders are at `dirs` ({ input, output }). */
export function dockerRunArgs({ config, sessionId, dirs, language }) {
  const name = containerName(sessionId);
  const tmp = (size) => `rw,noexec,nosuid,nodev,size=${size}`;
  return [
    'run', '-i', '--rm', '--name', name,
    // No network at all, no way to gain rights, nothing but the folders below to write to.
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
    '-v', `${dirs.input}:/input:ro`,
    '-v', `${dirs.output}:/output:rw`,
    '-e', `LANGUAGE=${String(language || 'zh-TW').replace(/[^A-Za-z-]/g, '').slice(0, 12) || 'zh-TW'}`,
    '-e', 'HOME=/work', '-e', 'MPLCONFIGDIR=/tmp/mpl',
    '--stop-timeout', '1',
    config.image
  ];
}
