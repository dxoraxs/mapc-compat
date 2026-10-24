import { decodeRpc } from '../frontend/core/rpc';
test('decodes object JSON', () => expect(decodeRpc('{"ok":true,"status":200,"body":"x"}')).toEqual({ ok: true, status: 200, body: 'x' }));
test('decodes double-encoded JSON', () => expect(decodeRpc(JSON.stringify('{"ok":false,"error":"e"}'))).toEqual({ ok: false, error: 'e' }));
test('passes objects through', () => expect(decodeRpc({ ok: true })).toEqual({ ok: true }));
