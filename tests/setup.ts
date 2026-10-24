import { mock } from 'bun:test';

// @steambrew/client needs Steam's runtime (React globals); stub it for unit tests.
mock.module('@steambrew/client', () => ({
  callable: () => async () => '{"ok":false,"error":"test stub"}',
  definePlugin: (f: any) => f,
  findClassModule: () => undefined,
  Millennium: {},
}));
