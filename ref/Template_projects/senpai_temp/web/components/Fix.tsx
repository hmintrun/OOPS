// "I had a client who ~~want~~ wanted a full redesign." from a correction.
export function Fix({ said, wrong, right, better }: { said: string; wrong: string; right: string; better: string }) {
  const at = wrong ? said.indexOf(wrong) : -1;
  if (at < 0) {
    const i = right ? better.indexOf(right) : -1;
    if (i < 0) return <>{better}</>;
    return <>{better.slice(0, i)}<span className="fix">{right}</span>{better.slice(i + right.length)}</>;
  }
  return (
    <>
      {said.slice(0, at)}
      <span className="strike">{wrong}</span>
      {right && <> <span className="fix">{right}</span></>}
      {said.slice(at + wrong.length)}
    </>
  );
}
