import Link from "next/link";
import AccountLink from "./AccountLink";
import CartButton from "./CartButton";
import HeaderNav from "./HeaderNav";

export default function Header() {
  return (
    <header className="header wrap">
      <Link className="logo" href="/" aria-label="leaf & bowl 홈">
        leaf &amp; bowl<span className="logo-sub">YOUR DAILY GREENS</span>
      </Link>
      <HeaderNav />
      <AccountLink />
      <CartButton />
    </header>
  );
}
