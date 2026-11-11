import { MIU, type MiuPose } from "./miu-art";

// Static SVG from the rig; the markup is ours, so injecting it is safe.
export function Miu({ pose, style, className }: { pose: MiuPose; style?: React.CSSProperties; className?: string }) {
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: MIU[pose] }} />;
}
