import { MaterialSymbol } from "@/components/ui";

export function LoginHero() {
  return (
    <header className="login-hero">
      <div className="login-hero__copy">
        <span className="login-hero__brand"><MaterialSymbol name="home" size={20} /> OOPS</span>
        <h1>Chào mừng bạn về nhà</h1>
        <p>Cùng hàng xóm gom nhu yếu phẩm và theo dõi từng đợt giao hàng.</p>
      </div>
      <div className="login-scene" aria-hidden="true">
        <div className="login-scene__sun" />
        <img className="login-scene__cloud login-scene__cloud--left" src="/assets/hero/cloud-a.webp" alt="" width={1622} height={459} />
        <img className="login-scene__cloud login-scene__cloud--right" src="/assets/hero/cloud-b.webp" alt="" width={1238} height={440} />
        <div className="login-scene__hill" />
        <img className="login-scene__school" src="/assets/hero/school-flag.webp" alt="" width={1046} height={888} />
        <img className="login-scene__bush login-scene__bush--left" src="/assets/hero/bush-single.webp" alt="" width={1667} height={606} />
        <img className="login-scene__bush login-scene__bush--right" src="/assets/hero/bush-double.webp" alt="" width={1744} height={375} />
        <img className="login-scene__family" src="/assets/hero/family.webp" alt="" width={1128} height={934} fetchPriority="high" />
      </div>
    </header>
  );
}
