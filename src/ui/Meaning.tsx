import { parseSense, splitSenses } from '../core/dict';

/** Renders an EJDict meaning: one line per sense, 『key translations』 in bold. */
export function Meaning({ text, max = 8 }: { text: string; max?: number }) {
  return (
    <>
      {splitSenses(text, max).map((sense, i) => (
        <div key={i}>
          {parseSense(sense).map((p, j) => (p.key ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}
        </div>
      ))}
    </>
  );
}
