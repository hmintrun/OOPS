export type PageScene = "basket" | "parcel" | "home";

const scenes = {
  basket: { src: "/assets/groceries-box.webp", width: 1024, height: 1024 },
  parcel: { src: "/assets/delivery-van.webp", width: 1024, height: 1024 },
  home: { src: "/assets/hero/family.webp", width: 1128, height: 934 },
} satisfies Record<PageScene, { src: string; width: number; height: number }>;

/** Decorative art; the page title and actions carry the meaning. */
export function PageArtwork({ scene }: { scene: PageScene }) {
  return (
    <div className="ui-page-art" aria-hidden="true">
      <img className="ui-page-art__cloud" src="/assets/hero/cloud-a.webp" width={1622} height={459} alt="" decoding="async" />
      <span className="ui-page-art__ground" />
      <img className="ui-page-art__subject" {...scenes[scene]} alt="" decoding="async" />
    </div>
  );
}
