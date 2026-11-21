type IllustratedScene = "basket" | "parcel" | "home";
export type PageScene = IllustratedScene | "flood-relief" | "sos-relief";

const scenes = {
  basket: { src: "/assets/groceries-box.webp", width: 1024, height: 1024 },
  parcel: { src: "/assets/delivery-van.webp", width: 1024, height: 1024 },
  home: { src: "/assets/hero/family.webp", width: 1128, height: 934 },
} satisfies Record<IllustratedScene, { src: string; width: number; height: number }>;

/** Decorative art; the page title and actions carry the meaning. */
export function PageArtwork({ scene }: { scene: PageScene }) {
  if (scene === "flood-relief") {
    return (
      <div className="ui-page-photo">
        <img src="/assets/flood-relief.webp" width={870} height={489}
          alt="Đội cứu trợ chuyển thùng nhu yếu phẩm lên xuồng ở vùng ngập" decoding="async" fetchPriority="high" />
      </div>
    );
  }
  if (scene === "sos-relief") {
    return (
      <div className="ui-page-photo">
        <img src="/assets/sos-relief.jpg" width={888} height={592}
          alt="Tình nguyện viên mặc áo phao trao thùng nhu yếu phẩm cứu trợ giữa vùng ngập lụt" decoding="async" fetchPriority="high" />
      </div>
    );
  }

  return (
    <div className="ui-page-art" aria-hidden="true">
      <img className="ui-page-art__cloud" src="/assets/hero/cloud-a.webp" width={1622} height={459} alt="" decoding="async" fetchPriority="low" />
      <span className="ui-page-art__ground" />
      <img className="ui-page-art__subject" {...scenes[scene]} alt="" decoding="async" fetchPriority="high" />
    </div>
  );
}
