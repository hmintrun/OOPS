import { Suspense } from "react";
import { LoginHero } from "./LoginHero";
import { LoginForm } from "./login-form";
import "./login.css";

/**
 * Màn hình đăng nhập sinh động, thân thiện với gia đình và cư dân.
 */
export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-layout">
        <LoginHero />
        <div className="login-panel">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
