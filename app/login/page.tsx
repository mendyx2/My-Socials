import { LoginForm } from "@/app/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="shell login-shell">
      <div className="card login-card">
        <div className="brand">
          <span className="brand-ring" aria-hidden="true" />
          <span className="brand-name">My Socials</span>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
