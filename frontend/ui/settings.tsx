import { CHIP_NAMES, type MacProfile } from '../core/hardware';
import { clearCache, loadProfile, saveProfile } from './profile';

const React = (window as any).SP_REACT;

const row = { display: 'flex', alignItems: 'center', gap: '12px', margin: '10px 0' } as const;
const label = { width: '160px' } as const;
const input = { padding: '4px 8px', background: '#1b2838', color: '#fff', border: '1px solid #3d4450' } as const;

export function Settings() {
  const [p, setP] = React.useState(() => loadProfile());
  const [text, setText] = React.useState(() => ({ gpuCores: String(p.gpuCores), ramGb: String(p.ramGb) }));
  const [note, setNote] = React.useState('');
  const update = (patch: Partial<MacProfile>) => {
    const next = { ...p, ...patch };
    setP(next);
    saveProfile(next);
  };
  const commit = (k: 'gpuCores' | 'ramGb') => {
    const n = Number(text[k]);
    if (text[k].trim() !== '' && Number.isFinite(n) && n > 0) update({ [k]: n });
    else setText({ ...text, [k]: String(p[k]) });
  };
  const chips = CHIP_NAMES.includes(p.chip) ? CHIP_NAMES : [p.chip, ...CHIP_NAMES];
  return (
    <div style={{ padding: '12px 0' }}>
      <div style={row}>
        <span style={label}>Чип</span>
        <select style={input} value={p.chip} onChange={(e: any) => update({ chip: e.target.value })}>
          {chips.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div style={row}>
        <span style={label}>Ядра GPU</span>
        <input style={input} type="number" min={1} value={text.gpuCores} onChange={(e: any) => setText({ ...text, gpuCores: e.target.value })} onBlur={() => commit('gpuCores')} />
      </div>
      <div style={row}>
        <span style={label}>Память, ГБ</span>
        <input style={input} type="number" min={1} value={text.ramGb} onChange={(e: any) => setText({ ...text, ramGb: e.target.value })} onBlur={() => commit('ramGb')} />
      </div>
      <div style={row}>
        <button
          style={input}
          onClick={() => {
            setNote(`Кэш сброшен (записей: ${clearCache()})`);
          }}
        >
          Сбросить кэш
        </button>
        <span>{note}</span>
      </div>
    </div>
  );
}
