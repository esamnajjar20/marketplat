import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { runChildJobsIndependently } from '../../src/scripts/childJobRunner';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

describe('runChildJobsIndependently', () => {
  const spawnMock = spawn as jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('continues after a failed child and reports aggregate failure at the end', async () => {
    const exitCodes = [1, 0, 0];
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        exitCode: number | null;
        signalCode: NodeJS.Signals | null;
        kill: jest.Mock;
      };
      child.exitCode = null;
      child.signalCode = null;
      child.kill = jest.fn();
      const code = exitCodes.shift() ?? 0;
      setImmediate(() => {
        child.exitCode = code;
        child.emit('close', code, null);
      });
      return child as never;
    });

    await expect(runChildJobsIndependently(['job:a', 'job:b', 'job:c'], 'test-runner'))
      .rejects.toThrow('1 of 3 jobs failed (job:a)');
    expect(spawnMock).toHaveBeenCalledTimes(3);
  });

  it('completes without throwing when all children succeed', async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        exitCode: number | null;
        signalCode: NodeJS.Signals | null;
        kill: jest.Mock;
      };
      child.exitCode = null;
      child.signalCode = null;
      child.kill = jest.fn();
      setImmediate(() => {
        child.exitCode = 0;
        child.emit('close', 0, null);
      });
      return child as never;
    });

    await expect(runChildJobsIndependently(['job:a', 'job:b'], 'test-runner')).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
